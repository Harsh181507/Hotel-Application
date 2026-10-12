package com.hotelconcierge.app.ui.staff

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccessAlarm
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Restaurant
import androidx.compose.material.icons.outlined.SoupKitchen
import androidx.compose.material.icons.outlined.StickyNote2
import androidx.compose.material.icons.outlined.TwoWheeler
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.PrimaryTabRow
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.hotelconcierge.app.data.Api
import com.hotelconcierge.app.data.Order
import com.hotelconcierge.app.data.Session
import com.hotelconcierge.app.data.jsonOf
import com.hotelconcierge.app.ui.common.EmptyState
import com.hotelconcierge.app.ui.common.HcCard
import com.hotelconcierge.app.ui.common.Loading
import com.hotelconcierge.app.ui.common.SmallButton
import com.hotelconcierge.app.ui.common.StatusPill
import com.hotelconcierge.app.ui.common.Tone
import com.hotelconcierge.app.ui.rupees
import com.hotelconcierge.app.ui.theme.HC
import com.hotelconcierge.app.ui.timeAgo
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private data class Stage(val status: String, val title: String, val next: String, val action: String, val icon: ImageVector)

private val STAGES = listOf(
    Stage("placed", "New", "preparing", "Start preparing", Icons.Outlined.SoupKitchen),
    Stage("preparing", "Preparing", "on_the_way", "Send to room", Icons.Outlined.TwoWheeler),
    Stage("on_the_way", "On the way", "delivered", "Delivered", Icons.Outlined.CheckCircle),
    Stage("delivered", "Delivered", "", "", Icons.Outlined.CheckCircle),
)

/** The kitchen screen: tickets move New → Preparing → On the way → Delivered. */
@Composable
fun KitchenOrdersScreen(session: Session.Staff) {
    val scope = rememberCoroutineScope()
    val toast = rememberToast()
    var orders by remember { mutableStateOf<List<Order>?>(null) }
    var stage by remember { mutableStateOf("placed") }
    var cancelling by remember { mutableStateOf<Order?>(null) }
    var tick by remember { mutableStateOf(0) }

    suspend fun load() { orders = runCatching { Api.get<List<Order>>("/api/staff/dining/orders?active=true") }.getOrDefault(orders ?: emptyList()) }
    LaunchedEffect(Unit) { load() }
    LaunchedEffect(Unit) { while (true) { delay(30_000); tick++ } } // refresh "x min ago"
    OnLive("order:new", "order:updated", "order:escalated") { load() }

    fun move(o: Order, status: String) = scope.launch {
        runCatching { Api.send("PATCH", "/api/staff/dining/orders/${o.id}", jsonOf("status" to status)) }
            .onFailure { toast(it.message ?: "Failed") }
        load()
    }

    @Suppress("UNUSED_VARIABLE") val refresh = tick // re-reads the clock every 30 s
    Column(Modifier.fillMaxSize()) {
        StaffHeader("Orders", "In-room dining")
        val all = orders ?: return Loading()
        PrimaryTabRow(selectedTabIndex = STAGES.indexOfFirst { it.status == stage }, containerColor = HC.Bg, contentColor = HC.Green) {
            STAGES.forEach { s ->
                val n = all.count { it.status == s.status }
                Tab(selected = stage == s.status, onClick = { stage = s.status }, text = { Text(if (n > 0) "${s.title} ($n)" else s.title, maxLines = 1) })
            }
        }
        val current = STAGES.first { it.status == stage }
        val list = all.filter { it.status == stage }.sortedBy { it.id }
        if (list.isEmpty()) return EmptyState(Icons.Outlined.Restaurant, "Nothing here right now.")
        LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            items(list, key = { it.id }) { o ->
                val late = o.escalatedAt != null && o.status == "placed"
                HcCard(border = if (late) HC.Red else HC.Border) {
                    Column(Modifier.padding(14.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("Room ${o.roomNumber}", fontFamily = FontFamily.Serif, fontSize = 22.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                            if (late) StatusPill("Late", Tone.Red, Icons.Outlined.AccessAlarm)
                            Text("  #${o.id} · ${timeAgo(o.createdAt)}", color = HC.Muted, style = MaterialTheme.typography.bodySmall)
                        }
                        Spacer(Modifier.height(8.dp))
                        o.items.forEach { line ->
                            Row { Text("${line.quantity}×  ", fontWeight = FontWeight.Bold, fontSize = 17.sp); Text(line.name, fontSize = 17.sp) }
                        }
                        if (o.note.isNotBlank()) {
                            Row(Modifier.padding(top = 8.dp).fillMaxWidth().background(HC.AmberSoft, RoundedCornerShape(10.dp)).padding(10.dp)) {
                                Icon(Icons.Outlined.StickyNote2, null, Modifier.size(16.dp), tint = Color(0xFF8A5D17))
                                Text("  ${o.note}", color = Color(0xFF8A5D17))
                            }
                        }
                        Row(Modifier.padding(top = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                            Text("${o.guestName} · ${rupees(o.totalPaise)}", color = HC.Muted, style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f))
                            if (current.next.isNotEmpty()) {
                                IconButton(onClick = { cancelling = o }) { Icon(Icons.Outlined.Close, "Cancel order", tint = HC.Red) }
                                SmallButton(current.action, { move(o, current.next) }, current.icon, primary = true)
                            }
                        }
                    }
                }
            }
        }
    }

    cancelling?.let { o ->
        ConfirmDialog("Cancel order #${o.id}?", "Room ${o.roomNumber} will be told the order was cancelled.", "Cancel order", { move(o, "cancelled") }, { cancelling = null })
    }
}
