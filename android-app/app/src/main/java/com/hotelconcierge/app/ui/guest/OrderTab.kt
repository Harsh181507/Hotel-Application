package com.hotelconcierge.app.ui.guest

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowForward
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.LocalFireDepartment
import androidx.compose.material.icons.outlined.Receipt
import androidx.compose.material.icons.outlined.Remove
import androidx.compose.material.icons.outlined.ShoppingBag
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.hotelconcierge.app.data.Api
import com.hotelconcierge.app.data.Bill
import com.hotelconcierge.app.data.Live
import com.hotelconcierge.app.data.MenuItem
import com.hotelconcierge.app.data.Order
import com.hotelconcierge.app.data.Session
import com.hotelconcierge.app.data.jsonOf
import com.hotelconcierge.app.ui.ORDER_STATUS
import com.hotelconcierge.app.ui.ORDER_STEPS
import com.hotelconcierge.app.ui.common.EmptyState
import com.hotelconcierge.app.ui.common.ErrorText
import com.hotelconcierge.app.ui.common.Field
import com.hotelconcierge.app.ui.common.HcCard
import com.hotelconcierge.app.ui.common.HcChip
import com.hotelconcierge.app.ui.common.Loading
import com.hotelconcierge.app.ui.common.PrimaryButton
import com.hotelconcierge.app.ui.common.StatusPill
import com.hotelconcierge.app.ui.common.VegMark
import com.hotelconcierge.app.ui.rupees
import com.hotelconcierge.app.ui.theme.HC
import com.hotelconcierge.app.ui.timeAgo
import kotlinx.coroutines.launch

fun imageUrl(server: String, imageId: Int) = "${server.trimEnd('/')}/api/images/$imageId"

/** In-room dining: menu, cart, live order tracking and the running bill. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OrderTab(session: Session.Guest, info: com.hotelconcierge.app.data.GuestInfo?, onOpenBill: () -> Unit) {
    val scope = rememberCoroutineScope()
    val toast = com.hotelconcierge.app.ui.staff.rememberToast()
    val foodTax = info?.taxes?.foodPct ?: 0.0
    var menu by remember { mutableStateOf<List<MenuItem>?>(null) }
    var bill by remember { mutableStateOf(Bill()) }
    var category by remember { mutableStateOf("All") }
    val cart = remember { mutableStateMapOf<Int, Int>() }
    var checkout by remember { mutableStateOf(false) }

    suspend fun loadMenu() { menu = runCatching { Api.get<List<MenuItem>>("/api/guest/menu") }.getOrDefault(menu ?: emptyList()) }
    suspend fun loadOrders() { runCatching { Api.get<Bill>("/api/guest/orders") }.onSuccess { bill = it } }

    LaunchedEffect(Unit) { loadMenu(); loadOrders() }
    LaunchedEffect(Unit) {
        Live.events.collect { if (it.name == "order:new" || it.name == "order:updated" || it.name == "connect") loadOrders() }
    }

    val menuItems = menu ?: return Loading()
    if (menuItems.isEmpty()) return EmptyState(Icons.Outlined.ShoppingBag, "In-room dining isn't available yet. Please message the front desk to order.")

    val byId = menuItems.associateBy { it.id }
    val lines = cart.mapNotNull { (id, qty) -> byId[id]?.takeIf { it.available && qty > 0 }?.let { it to qty } }
    val count = lines.sumOf { it.second }
    val total = lines.sumOf { it.first.pricePaise * it.second }
    val categories = listOf("All") + menuItems.map { it.category }.distinct()
    val active = bill.orders.filter { it.status in setOf("placed", "preparing", "on_the_way") }
    fun setQty(id: Int, qty: Int) { if (qty <= 0) cart.remove(id) else cart[id] = qty.coerceAtMost(20) }

    Box(Modifier.fillMaxSize()) {
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 16.dp, bottom = 96.dp)) {
            item {
                Text("In-room dining", style = MaterialTheme.typography.headlineMedium)
                if (bill.totalPaise > 0) {
                    Spacer(Modifier.height(8.dp))
                    Row(
                        Modifier.clip(CircleShape).background(HC.Surface).border(1.dp, HC.Border, CircleShape).clickable { onOpenBill() }.padding(horizontal = 14.dp, vertical = 7.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(Icons.Outlined.Receipt, null, Modifier.size(16.dp))
                        Text("  Your room bill ", fontWeight = FontWeight.SemiBold)
                        Icon(Icons.AutoMirrored.Outlined.ArrowForward, null, Modifier.size(16.dp))
                    }
                }
                Spacer(Modifier.height(12.dp))
            }
            items(active, key = { "o${it.id}" }) { o ->
                OrderTracker(o, onPay = onOpenBill) {
                    scope.launch {
                        runCatching { Api.send("POST", "/api/guest/orders/${o.id}/cancel") }.onFailure { toast(it.message ?: "Couldn't cancel") }
                        loadOrders()
                    }
                }
                Spacer(Modifier.height(10.dp))
            }
            item {
                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(vertical = 6.dp)) {
                    items(categories) { c -> HcChip(c, c == category, { category = c }) }
                }
            }
            items(menuItems.filter { category == "All" || it.category == category }, key = { it.id }) { item ->
                MenuRow(session.server, item, cart[item.id] ?: 0) { setQty(item.id, it) }
                HorizontalDivider(color = HC.Border)
            }
        }

        if (count > 0) {
            Row(
                Modifier.align(Alignment.BottomCenter).padding(12.dp).fillMaxWidth()
                    .clip(RoundedCornerShape(16.dp)).background(HC.Green).clickable { checkout = true }
                    .padding(horizontal = 18.dp, vertical = 15.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.Outlined.ShoppingBag, null, tint = Color.White)
                Text("  $count item${if (count > 1) "s" else ""} · ${rupees(total)}", color = Color.White, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                Text("View order ", color = Color.White, fontWeight = FontWeight.Bold)
                Icon(Icons.AutoMirrored.Outlined.ArrowForward, null, tint = Color.White)
            }
        }
    }

    if (checkout) {
        var note by remember { mutableStateOf("") }
        var busy by remember { mutableStateOf(false) }
        var error by remember { mutableStateOf<String?>(null) }
        ModalBottomSheet(onDismissRequest = { checkout = false }, containerColor = HC.Surface) {
            Column(Modifier.padding(horizontal = 20.dp).padding(bottom = 24.dp).verticalScroll(rememberScrollState())) {
                Text("Your order", style = MaterialTheme.typography.titleLarge)
                Spacer(Modifier.height(12.dp))
                lines.forEach { (item, qty) ->
                    Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                        VegMark(item.veg)
                        Text("  ${item.name}", Modifier.weight(1f))
                        Stepper(qty) { setQty(item.id, it) }
                        Text(rupees(item.pricePaise * qty), Modifier.width(76.dp), fontWeight = FontWeight.SemiBold, textAlign = androidx.compose.ui.text.style.TextAlign.End)
                    }
                }
                Spacer(Modifier.height(10.dp))
                Field(note, { note = it.take(300) }, "Any instructions?", placeholder = "e.g. less spicy, no onion", singleLine = false)
                val tax = Math.round(total * foodTax / 100).toInt()
                if (tax > 0) {
                    Row(Modifier.fillMaxWidth().padding(top = 12.dp)) {
                        Text("GST ${com.hotelconcierge.app.ui.pct(foodTax)}%", Modifier.weight(1f), color = HC.Muted)
                        Text(rupees(tax), color = HC.Muted)
                    }
                }
                Row(Modifier.fillMaxWidth().padding(vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("Total (added to your room bill)", Modifier.weight(1f), color = HC.Muted)
                    Text(rupees(total + tax), style = MaterialTheme.typography.titleLarge)
                }
                ErrorText(error)
                Spacer(Modifier.height(8.dp))
                PrimaryButton(
                    "Place order · ${rupees(total + Math.round(total * foodTax / 100).toInt())}", loading = busy, enabled = lines.isNotEmpty(), modifier = Modifier.fillMaxWidth(),
                    onClick = {
                        scope.launch {
                            busy = true
                            error = null
                            runCatching {
                                Api.send("POST", "/api/guest/orders", jsonOf("items" to lines.map { mapOf("id" to it.first.id, "quantity" to it.second) }, "note" to note))
                            }.onSuccess {
                                cart.clear()
                                checkout = false
                                loadOrders()
                            }.onFailure { error = it.message; loadMenu() }
                            busy = false
                        }
                    },
                )
            }
        }
    }
}

@Composable
private fun MenuRow(server: String, item: MenuItem, qty: Int, onQty: (Int) -> Unit) {
    Row(Modifier.fillMaxWidth().padding(vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                VegMark(item.veg)
                if (item.popular) {
                    Spacer(Modifier.width(8.dp))
                    Row(Modifier.clip(CircleShape).background(Color(0xFFFBE7D6)).padding(horizontal = 8.dp, vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Outlined.LocalFireDepartment, null, Modifier.size(12.dp), tint = Color(0xFFB2541F))
                        Text(" Popular", style = MaterialTheme.typography.labelSmall, color = Color(0xFFB2541F))
                    }
                }
            }
            Text(item.name, style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 4.dp))
            Text(rupees(item.pricePaise), fontWeight = FontWeight.SemiBold)
            if (item.description.isNotBlank()) Text(item.description, color = HC.Muted, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 4.dp))
        }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.width(112.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            if (item.imageId != null) {
                AsyncImage(
                    model = imageUrl(server, item.imageId), contentDescription = item.name, contentScale = ContentScale.Crop,
                    modifier = Modifier.size(112.dp, 92.dp).clip(RoundedCornerShape(14.dp)).background(HC.Surface2),
                )
                Spacer(Modifier.height(6.dp))
            }
            when {
                !item.available -> Text("Sold out", color = HC.Muted, style = MaterialTheme.typography.labelMedium, modifier = Modifier.background(HC.Surface2, RoundedCornerShape(8.dp)).padding(horizontal = 10.dp, vertical = 6.dp))
                qty > 0 -> Stepper(qty, onQty)
                else -> Text(
                    "ADD", color = HC.Green, fontWeight = FontWeight.ExtraBold,
                    modifier = Modifier.clip(RoundedCornerShape(10.dp)).background(HC.Surface).border(1.dp, HC.Border, RoundedCornerShape(10.dp))
                        .clickable { onQty(1) }.padding(horizontal = 30.dp, vertical = 8.dp),
                )
            }
        }
    }
}

@Composable
private fun Stepper(qty: Int, onQty: (Int) -> Unit) {
    Row(Modifier.clip(RoundedCornerShape(10.dp)).background(HC.Green), verticalAlignment = Alignment.CenterVertically) {
        Icon(Icons.Outlined.Remove, "Remove one", tint = Color.White, modifier = Modifier.clickable { onQty(qty - 1) }.padding(8.dp).size(16.dp))
        Text("$qty", color = Color.White, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 4.dp))
        Icon(Icons.Outlined.Add, "Add one", tint = Color.White, modifier = Modifier.clickable { onQty(qty + 1) }.padding(8.dp).size(16.dp))
    }
}

@Composable
private fun OrderTracker(order: Order, onPay: () -> Unit, onCancel: () -> Unit) {
    val step = ORDER_STEPS.indexOf(order.status)
    HcCard {
        Column(Modifier.padding(14.dp)) {
            Row {
                Text("Order #${order.id}", fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                Text("${timeAgo(order.createdAt)} · ${rupees(order.totalPaise)}", color = HC.Muted, style = MaterialTheme.typography.bodySmall)
            }
            Text(order.items.joinToString(", ") { "${it.quantity}× ${it.name}" }, color = HC.Muted, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(vertical = 8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                ORDER_STEPS.forEachIndexed { i, s ->
                    Column(Modifier.weight(1f)) {
                        Box(Modifier.fillMaxWidth().height(5.dp).clip(CircleShape).background(if (i <= step) HC.Green else HC.Surface2))
                        Text(ORDER_STATUS[s]!!.first, style = MaterialTheme.typography.labelSmall, color = if (i == step) HC.GreenDark else HC.Muted, modifier = Modifier.padding(top = 4.dp))
                    }
                }
            }
            Row {
                TextButton(onClick = onPay) { Text("Pay now", color = HC.Maroon) }
                if (order.status == "placed") TextButton(onClick = onCancel) { Text("Cancel order", color = HC.Maroon) }
            }
        }
    }
}
