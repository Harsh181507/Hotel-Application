package com.hotelconcierge.app.ui.staff

import android.Manifest
import android.os.Build
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Assignment
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowRight
import androidx.compose.material.icons.automirrored.outlined.Logout
import androidx.compose.material.icons.automirrored.outlined.MenuBook
import androidx.compose.material.icons.outlined.CleaningServices
import androidx.compose.material.icons.outlined.Groups
import androidx.compose.material.icons.outlined.Inbox
import androidx.compose.material.icons.outlined.KingBed
import androidx.compose.material.icons.outlined.MoreHoriz
import androidx.compose.material.icons.outlined.NotificationsActive
import androidx.compose.material.icons.outlined.Restaurant
import androidx.compose.material.icons.outlined.RoomService
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.material.icons.outlined.DirectionsCar
import androidx.compose.material.icons.outlined.ReceiptLong
import androidx.compose.material.icons.outlined.TableRestaurant
import com.hotelconcierge.app.data.Api
import com.hotelconcierge.app.data.Conversation
import com.hotelconcierge.app.data.HkRoom
import com.hotelconcierge.app.data.Live
import com.hotelconcierge.app.data.Order
import com.hotelconcierge.app.data.ServiceRequest
import com.hotelconcierge.app.data.Session
import com.hotelconcierge.app.data.SessionStore
import com.hotelconcierge.app.service.Alerts
import com.hotelconcierge.app.service.OnDutyService
import com.hotelconcierge.app.ui.ROLES
import com.hotelconcierge.app.ui.common.HcCard
import com.hotelconcierge.app.ui.theme.HC
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay

private data class StaffTab(val key: String, val label: String, val icon: ImageVector)

private val TAB = mapOf(
    "inbox" to StaffTab("inbox", "Inbox", Icons.Outlined.Inbox),
    "tasks" to StaffTab("tasks", "Tasks", Icons.AutoMirrored.Outlined.Assignment),
    "orders" to StaffTab("orders", "Orders", Icons.Outlined.Restaurant),
    "housekeeping" to StaffTab("housekeeping", "Rooms", Icons.Outlined.CleaningServices),
    "menu" to StaffTab("menu", "Menu", Icons.AutoMirrored.Outlined.MenuBook),
    "more" to StaffTab("more", "More", Icons.Outlined.MoreHoriz),
)

private fun tabsFor(role: String) = when (role) {
    "housekeeping" -> listOf("housekeeping", "tasks", "more")
    "kitchen" -> listOf("orders", "tasks", "menu", "more")
    "maintenance" -> listOf("tasks", "more")
    else -> listOf("inbox", "tasks", "orders", "housekeeping", "more")
}

/** Screens opened on top of the tabs (with a back arrow). */
sealed interface StaffRoute {
    data class Chat(val conversation: Conversation) : StaffRoute
    data class Page(val key: String) : StaffRoute
}

private data class Counts(val unread: Int = 0, val tasks: Int = 0, val orders: Int = 0, val rooms: Int = 0, val payments: Int = 0)

fun staffLogout(context: android.content.Context, message: String? = null) {
    OnDutyService.stop(context)
    Live.disconnect()
    SessionStore.clear(message)
}

@Composable
fun StaffHome(session: Session.Staff) {
    val context = LocalContext.current
    val tabs = tabsFor(session.role)
    var tab by rememberSaveable { mutableStateOf(tabs.first()) }
    var route by remember { mutableStateOf<StaffRoute?>(null) }
    var counts by remember { mutableStateOf(Counts()) }
    val connected by Live.connected.collectAsState()

    // Notification permission first (Android 13+), then go "on duty".
    val askNotifications = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { OnDutyService.start(context) }
    LaunchedEffect(session.token) {
        if (Build.VERSION.SDK_INT >= 33 && !Alerts.canNotify(context)) askNotifications.launch(Manifest.permission.POST_NOTIFICATIONS)
        else OnDutyService.start(context)
        Live.connect(session)
    }

    // Badge numbers, refreshed (at most every 400 ms) when anything changes.
    val refresh = remember { Channel<Unit>(Channel.CONFLATED) }
    LaunchedEffect(session.token) {
        refresh.trySend(Unit)
        for (signal in refresh) {
            counts = Counts(
                unread = if (session.isDesk) runCatching { Api.get<List<Conversation>>("/api/staff/conversations").sumOf { it.unread } }.getOrDefault(counts.unread) else 0,
                tasks = runCatching { Api.get<List<ServiceRequest>>("/api/staff/requests?status=open").size }.getOrDefault(counts.tasks),
                orders = if (session.isDesk || session.role == "kitchen") runCatching { Api.get<List<Order>>("/api/staff/dining/orders").count { it.status == "placed" } }.getOrDefault(counts.orders) else 0,
                rooms = if (session.isDesk || session.role == "housekeeping") runCatching {
                    Api.get<List<HkRoom>>("/api/staff/housekeeping/rooms").count { it.status == "dirty" && (session.isDesk || it.assignedTo == session.id || it.assignedTo == null) }
                }.getOrDefault(counts.rooms) else 0,
                payments = if (session.isDesk) runCatching {
                    Api.get<List<com.hotelconcierge.app.data.PendingPayment>>("/api/staff/billing/payments/pending").size
                }.getOrDefault(counts.payments) else 0,
            )
            delay(400)
        }
    }
    LaunchedEffect(Unit) {
        Live.events.collect { e ->
            if (e.name == "auth_failed") staffLogout(context, "Please log in again.") else refresh.trySend(Unit)
        }
    }

    BackHandler(enabled = route != null) { route = null }

    when (val r = route) {
        is StaffRoute.Chat -> StaffChatScreen(r.conversation, onBack = { route = null })
        is StaffRoute.Page -> Box(Modifier.fillMaxSize()) { StaffPage(r.key, session, onBack = { route = null }, onOpen = { route = StaffRoute.Page(it) }) }
        null -> Column(Modifier.fillMaxSize()) {
            if (!connected) {
                Text(
                    "Reconnecting…", color = Color.White, style = MaterialTheme.typography.labelMedium,
                    modifier = Modifier.fillMaxWidth().background(HC.Amber).padding(vertical = 4.dp, horizontal = 16.dp),
                )
            }
            Box(Modifier.weight(1f)) {
                when (tab) {
                    "inbox" -> InboxScreen(onOpen = { route = StaffRoute.Chat(it) })
                    "tasks" -> TasksScreen(session)
                    "orders" -> KitchenOrdersScreen(session)
                    "housekeeping" -> HousekeepingScreen(session)
                    "menu" -> MenuEditorScreen(session)
                    else -> MoreScreen(session, counts.payments, onOpen = { route = StaffRoute.Page(it) })
                }
            }
            NavigationBar(containerColor = HC.Surface, tonalElevation = 0.dp) {
                val colors = NavigationBarItemDefaults.colors(
                    selectedIconColor = HC.Green, selectedTextColor = HC.Green, indicatorColor = HC.GreenSoft,
                    unselectedIconColor = HC.Muted, unselectedTextColor = HC.Muted,
                )
                tabs.forEach { key ->
                    val t = TAB.getValue(key)
                    val badge = when (key) {
                        "inbox" -> counts.unread
                        "tasks" -> counts.tasks
                        "orders" -> counts.orders
                        "housekeeping" -> counts.rooms
                        "more" -> counts.payments
                        else -> 0
                    }
                    val label = if (key == "housekeeping" && session.isDesk) "Cleaning" else t.label
                    NavigationBarItem(
                        selected = tab == key,
                        onClick = { tab = key },
                        icon = {
                            BadgedBox(badge = { if (badge > 0) Badge(containerColor = HC.Maroon, contentColor = Color.White) { Text(if (badge > 99) "99+" else "$badge") } }) {
                                Icon(t.icon, null)
                            }
                        },
                        label = { Text(label, maxLines = 1) },
                        colors = colors,
                    )
                }
            }
        }
    }
}

@Composable
private fun StaffPage(key: String, session: Session.Staff, onBack: () -> Unit, onOpen: (String) -> Unit) {
    when {
        key.startsWith("bill:") -> BillsScreen(onBack, openStayId = key.removePrefix("bill:").toIntOrNull())
    }
    when (key) {
        "rooms" -> RoomsScreen(session, onBack, onOpenBill = { onOpen("bill:$it") })
        "bills" -> BillsScreen(onBack)
        "tables" -> TablesScreen(session, onBack)
        "vehicles" -> VehiclesScreen(onBack)
        "menu" -> MenuEditorScreen(session, onBack)
        "answers" -> AnswersEditorScreen(onBack)
        "team" -> TeamScreen(session, onBack)
        "settings" -> SettingsScreen(onBack)
    }
}

private data class MoreEntry(val key: String, val label: String, val text: String, val icon: ImageVector, val badge: Int = 0)

@Composable
private fun MoreScreen(session: Session.Staff, pendingPayments: Int, onOpen: (String) -> Unit) {
    val context = LocalContext.current
    val entries = buildList {
        if (session.isDesk) {
            add(MoreEntry("rooms", "Rooms & check-in", "Check guests in and out, codes, room QR", Icons.Outlined.KingBed))
            add(MoreEntry("bills", "Bills & payments", "Final bill per room, UPI payments to confirm, print", Icons.Outlined.ReceiptLong, pendingPayments))
            add(MoreEntry("tables", "Table bookings", "Restaurant bookings and your tables", Icons.Outlined.TableRestaurant))
            add(MoreEntry("vehicles", "Vehicles", "Vehicle bookings, your cars and drivers", Icons.Outlined.DirectionsCar))
            add(MoreEntry("menu", "Menu", "In-room dining items, prices and photos", Icons.AutoMirrored.Outlined.MenuBook))
            add(MoreEntry("answers", "Answers", "Wi-Fi, timings, nearby places (the autopilot uses these)", Icons.Outlined.RoomService))
        }
        if (session.role == "kitchen") add(MoreEntry("tables", "Table bookings", "Restaurant bookings for the day", Icons.Outlined.TableRestaurant))
        if (session.isAdmin) {
            add(MoreEntry("team", "Team", "Staff logins and roles", Icons.Outlined.Groups))
            add(MoreEntry("settings", "Settings", "Hotel name, autopilot, late alerts", Icons.Outlined.Settings))
        }
    }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
        StaffHeader("More")
        Column(Modifier.padding(horizontal = 16.dp)) {
            HcCard {
                Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(46.dp).clip(CircleShape).background(HC.Green), contentAlignment = Alignment.Center) {
                        Text(session.name.take(1).uppercase(), color = Color.White, fontWeight = FontWeight.Bold)
                    }
                    Spacer(Modifier.width(14.dp))
                    Column {
                        Text(session.name, style = MaterialTheme.typography.titleMedium)
                        Text("${ROLES[session.role] ?: session.role} · ${session.login}", color = HC.Muted, style = MaterialTheme.typography.bodySmall)
                        Text(Api.host(session.server), color = HC.Muted, style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
            Spacer(Modifier.height(12.dp))
            entries.forEach { e ->
                HcCard(Modifier.padding(bottom = 8.dp).clip(RoundedCornerShape(18.dp)).clickable { onOpen(e.key) }) {
                    Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(e.icon, null, tint = HC.Green)
                        Spacer(Modifier.width(14.dp))
                        Column(Modifier.weight(1f)) {
                            Text(e.label, style = MaterialTheme.typography.titleMedium)
                            Text(e.text, color = HC.Muted, style = MaterialTheme.typography.bodySmall)
                        }
                        com.hotelconcierge.app.ui.common.CountBadge(e.badge)
                        Icon(Icons.AutoMirrored.Outlined.KeyboardArrowRight, null, tint = HC.Muted)
                    }
                }
            }
            Spacer(Modifier.height(8.dp))
            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(HC.GreenSoft).padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Outlined.NotificationsActive, null, tint = HC.GreenDark)
                Spacer(Modifier.width(10.dp))
                Text("On duty: new work alerts this phone even when the app is closed, until you log out.", color = HC.GreenDark, style = MaterialTheme.typography.bodySmall)
            }
            Spacer(Modifier.height(16.dp))
            HorizontalDivider(color = HC.Border)
            Row(
                Modifier.fillMaxWidth().clickable { staffLogout(context) }.padding(vertical = 18.dp, horizontal = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.AutoMirrored.Outlined.Logout, null, tint = HC.Maroon)
                Text("  Log out (stops alerts on this phone)", color = HC.Maroon, style = MaterialTheme.typography.titleSmall)
            }
        }
    }
}
