package com.hotelconcierge.app.service

import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import com.hotelconcierge.app.R
import com.hotelconcierge.app.data.AutopilotHandled
import com.hotelconcierge.app.data.HkRoom
import com.hotelconcierge.app.data.Live
import com.hotelconcierge.app.data.LiveEvent
import com.hotelconcierge.app.data.Message
import com.hotelconcierge.app.data.Order
import com.hotelconcierge.app.data.ServiceRequest
import com.hotelconcierge.app.data.Session
import com.hotelconcierge.app.data.SessionStore
import com.hotelconcierge.app.data.decode
import com.hotelconcierge.app.ui.DEPARTMENTS
import com.hotelconcierge.app.ui.ROLES
import com.hotelconcierge.app.ui.requestKind
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * "On duty" mode for staff: while someone is logged in, this service keeps the
 * live connection open (with a small permanent notification) and turns new
 * work into alerts, even when the app is closed or the phone is in a pocket.
 */
class OnDutyService : Service() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var listening: Job? = null
    private val pendingChatAlerts = mutableMapOf<Int, Job>()
    private val alertedRooms = mutableSetOf<Int>()

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val session = SessionStore.session.value as? Session.Staff
        val notification = NotificationCompat.Builder(this, Alerts.DUTY_CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_bell)
            .setContentTitle(session?.let { "On duty · ${it.name}" } ?: "Hotel Concierge")
            .setContentText(session?.let { "${ROLES[it.role] ?: it.role}: you'll be alerted about new work" } ?: "Logged out")
            .setOngoing(true)
            .setContentIntent(Alerts.openAppIntent(this))
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .build()
        // Android requires this right after startForegroundService(), even if we stop at once
        // (e.g. the saved login expired a moment ago); skipping it crashes the app.
        val type = if (Build.VERSION.SDK_INT >= 34) ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE else 0
        ServiceCompat.startForeground(this, NOTIFICATION_ID, notification, type)
        if (session == null) {
            stopOnDuty()
            return START_NOT_STICKY
        }

        if (listening == null) {
            listening = scope.launch { Live.events.collect { handle(it) } }
            // However the login ends (log out, expired, code changed), stop being "on duty".
            scope.launch { SessionStore.session.collect { if (it !is Session.Staff) stopOnDuty() } }
        }
        Live.connect(session)
        return START_STICKY // restarted by Android after low memory; reconnects from the saved login
    }

    private fun stopOnDuty() {
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    private fun alert(title: String, body: String) = Alerts.staffAlert(this, title, body)

    private fun handle(event: LiveEvent) {
        val session = SessionStore.session.value as? Session.Staff ?: return
        when (event.name) {
            // Guest chat: wait 2 s. If the autopilot answers it, nobody is disturbed.
            "message:new" -> {
                val m = event.decode<Message>() ?: return
                if (!session.isDesk || m.sender != "guest" || m.requestId != null) return
                pendingChatAlerts.remove(m.stayId)?.cancel()
                pendingChatAlerts[m.stayId] = scope.launch {
                    delay(2_000)
                    pendingChatAlerts.remove(m.stayId)
                    alert("New guest message", m.body.take(120))
                }
            }
            "autopilot:handled" -> {
                val h = event.decode<AutopilotHandled>() ?: return
                if (h.action in setOf("answer", "request", "menu", "greeting", "thanks")) pendingChatAlerts.remove(h.stayId)?.cancel()
            }
            "request:new" -> {
                val q = event.decode<ServiceRequest>() ?: return
                alert("${requestKind(q.type).label} · Room ${q.roomNumber}", q.details.ifBlank { "New ${DEPARTMENTS[q.department]} task" })
            }
            "request:escalated" -> {
                val q = event.decode<ServiceRequest>() ?: return
                alert("Late: Room ${q.roomNumber}", "${requestKind(q.type).label} not accepted yet")
            }
            "order:new" -> {
                val o = event.decode<Order>() ?: return
                alert("New order · Room ${o.roomNumber}", o.items.joinToString(", ") { "${it.quantity}× ${it.name}" })
            }
            "order:escalated" -> {
                val o = event.decode<Order>() ?: return
                alert("Late order · Room ${o.roomNumber}", "Order #${o.id} not started yet")
            }
            "payment:submitted" -> {
                val p = event.decode<com.hotelconcierge.app.data.PendingPayment>() ?: return
                if (session.isDesk) alert("UPI payment · Room ${p.roomNumber}", "${com.hotelconcierge.app.ui.rupees(p.amountPaise)}, ref ${p.utr}. Check it and confirm in Bills.")
            }
            "table:booked" -> {
                val t = event.decode<com.hotelconcierge.app.data.TableBooking>() ?: return
                if (session.isDesk || session.role == "kitchen") {
                    alert("Table booked · Room ${t.roomNumber}", "${t.partySize} people, ${com.hotelconcierge.app.ui.dayLong(t.startLocal.take(10))} ${com.hotelconcierge.app.ui.time12(t.startLocal.substring(11))}")
                }
            }
            "vehicle:booked" -> {
                val v = event.decode<com.hotelconcierge.app.data.VehicleBooking>() ?: return
                if (session.isDesk) alert("Vehicle booked · Room ${v.roomNumber}", "${v.vehicle.name.ifBlank { v.vehicle.type }}, ${com.hotelconcierge.app.ui.rangeLabel(v.startLocal, v.endLocal)}")
            }
            "room:updated" -> {
                val r = event.decode<HkRoom>() ?: return
                if (session.role != "housekeeping") return
                val needsMe = r.status == "dirty" && r.priority && r.assignedTo == session.id
                if (needsMe && alertedRooms.add(r.id)) alert("Clean room ${r.number}", r.note.ifBlank { "Priority cleaning" })
                if (r.status != "dirty") alertedRooms.remove(r.id)
            }
            "auth_failed" -> {
                SessionStore.clear("Please log in again.")
                stopSelf()
            }
        }
    }

    override fun onDestroy() {
        scope.cancel()
        // Logged out: close the connection. (Still logged in = Android is just restarting us.)
        if (SessionStore.session.value !is Session.Staff) Live.disconnect()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    companion object {
        private const val NOTIFICATION_ID = 4210

        fun start(context: Context) {
            ContextCompat.startForegroundService(context, Intent(context, OnDutyService::class.java))
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, OnDutyService::class.java))
        }
    }
}
