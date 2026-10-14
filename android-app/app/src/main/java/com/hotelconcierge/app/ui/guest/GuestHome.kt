package com.hotelconcierge.app.ui.guest

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Logout
import androidx.compose.material.icons.outlined.ChatBubbleOutline
import androidx.compose.material.icons.outlined.MenuBook
import androidx.compose.material.icons.outlined.Restaurant
import androidx.compose.material.icons.outlined.EventAvailable
import androidx.compose.material.icons.outlined.ReceiptLong
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.hotelconcierge.app.data.Api
import com.hotelconcierge.app.data.GuestInfo
import com.hotelconcierge.app.data.Live
import com.hotelconcierge.app.data.Message
import com.hotelconcierge.app.data.Session
import com.hotelconcierge.app.data.SessionEnded
import com.hotelconcierge.app.data.SessionStore
import com.hotelconcierge.app.data.decode
import com.hotelconcierge.app.ui.theme.HC

private val ENDED = mapOf(
    "checked_out" to "You have been checked out. Thank you for staying with us!",
    "code_changed" to "Your access code was changed by the front desk. Please scan and log in again.",
)

fun guestLogout(message: String? = null) {
    Live.disconnect()
    SessionStore.clear(message)
}

@Composable
fun GuestHome(session: Session.Guest) {
    var tab by rememberSaveable { mutableStateOf("answers") }
    var unread by remember { mutableIntStateOf(0) }
    val currentTab by rememberUpdatedState(tab)
    // Taxes, how to pay, restaurant hours and the hotel's date/time (for bookings).
    var info by remember { mutableStateOf<GuestInfo?>(null) }
    LaunchedEffect(session.token) { info = runCatching { Api.get<GuestInfo>("/api/guest/info") }.getOrNull() }

    LaunchedEffect(session.token) {
        Live.connect(session)
        Live.events.collect { e ->
            when (e.name) {
                "session:ended" -> guestLogout(ENDED[e.decode<SessionEnded>()?.reason] ?: "Your session has ended.")
                "auth_failed" -> guestLogout("Your session has ended. Please scan and log in again.")
                "message:new" -> if (currentTab != "chat" && e.decode<Message>()?.sender != "guest") unread++
            }
        }
    }

    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(start = 18.dp, end = 6.dp, top = 8.dp, bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(session.hotelName.ifBlank { "Hotel" }, style = MaterialTheme.typography.titleLarge, color = HC.Green)
                Text("Room ${session.roomNumber} · Welcome, ${session.name.substringBefore(' ')}", color = HC.Muted, style = MaterialTheme.typography.bodySmall)
            }
            IconButton(onClick = { guestLogout() }) { Icon(Icons.AutoMirrored.Outlined.Logout, "Log out", tint = HC.Muted) }
        }
        HorizontalDivider(color = HC.Border)
        Box(Modifier.weight(1f)) {
            when (tab) {
                "answers" -> AnswersTab(onAskDesk = { tab = "chat"; unread = 0 })
                "order" -> OrderTab(session, info, onOpenBill = { tab = "bill" })
                "book" -> BookTab(info)
                "bill" -> BillTab(session, info)
                else -> GuestChatTab(onOpenMenu = { tab = "order" })
            }
        }
        NavigationBar(containerColor = HC.Surface, tonalElevation = 0.dp) {
            val colors = NavigationBarItemDefaults.colors(
                selectedIconColor = HC.Green, selectedTextColor = HC.Green, indicatorColor = HC.GreenSoft,
                unselectedIconColor = HC.Muted, unselectedTextColor = HC.Muted,
            )
            NavigationBarItem(tab == "answers", { tab = "answers" }, { Icon(Icons.Outlined.MenuBook, null) }, label = { Text("Answers") }, colors = colors)
            NavigationBarItem(tab == "order", { tab = "order" }, { Icon(Icons.Outlined.Restaurant, null) }, label = { Text("Order") }, colors = colors)
            NavigationBarItem(tab == "book", { tab = "book" }, { Icon(Icons.Outlined.EventAvailable, null) }, label = { Text("Book") }, colors = colors)
            NavigationBarItem(tab == "bill", { tab = "bill" }, { Icon(Icons.Outlined.ReceiptLong, null) }, label = { Text("Bill") }, colors = colors)
            NavigationBarItem(
                tab == "chat", { tab = "chat"; unread = 0 },
                {
                    BadgedBox(badge = { if (unread > 0) Badge(containerColor = HC.Maroon, contentColor = Color.White) { Text("$unread") } }) {
                        Icon(Icons.Outlined.ChatBubbleOutline, null)
                    }
                },
                label = { Text("Desk") }, colors = colors,
            )
        }
    }
}
