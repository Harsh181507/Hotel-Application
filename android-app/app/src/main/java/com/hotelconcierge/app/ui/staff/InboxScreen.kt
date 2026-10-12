package com.hotelconcierge.app.ui.staff

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Inbox
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.hotelconcierge.app.data.Api
import com.hotelconcierge.app.data.Conversation
import com.hotelconcierge.app.ui.common.ChatModel
import com.hotelconcierge.app.ui.common.ChatPanel
import com.hotelconcierge.app.ui.common.CountBadge
import com.hotelconcierge.app.ui.common.EmptyState
import com.hotelconcierge.app.ui.common.Loading
import com.hotelconcierge.app.ui.common.RoomBadge
import com.hotelconcierge.app.ui.theme.HC
import com.hotelconcierge.app.ui.timeAgo

@Composable
fun InboxScreen(onOpen: (Conversation) -> Unit) {
    var list by remember { mutableStateOf<List<Conversation>?>(null) }
    suspend fun load() { list = runCatching { Api.get<List<Conversation>>("/api/staff/conversations") }.getOrDefault(list ?: emptyList()) }
    LaunchedEffect(Unit) { load() }
    OnLive("message:new", "messages:read", "stay:updated") { load() }

    Column(Modifier.fillMaxSize()) {
        StaffHeader("Inbox", "Guests checked in now")
        val rows = list ?: return Loading()
        if (rows.isEmpty()) return EmptyState(Icons.Outlined.Inbox, "No guests are checked in yet. Check one in from More → Rooms.")
        LazyColumn(Modifier.fillMaxSize()) {
            items(rows, key = { it.stayId }) { c ->
                Row(Modifier.fillMaxWidth().clickable { onOpen(c) }.padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                    RoomBadge(c.roomNumber)
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Row {
                            Text(c.guestName, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                            Text(timeAgo(c.lastAt), color = HC.Muted, style = MaterialTheme.typography.bodySmall)
                        }
                        val prefix = when (c.lastSender) { "guest", "system", null -> ""; "bot" -> "Auto: "; else -> "You: " }
                        Text(
                            c.lastBody?.let { prefix + it } ?: "No messages yet",
                            color = if (c.unread > 0) HC.Text else HC.Muted,
                            fontWeight = if (c.unread > 0) FontWeight.SemiBold else FontWeight.Normal,
                            maxLines = 1, overflow = TextOverflow.Ellipsis,
                        )
                    }
                    Spacer(Modifier.width(8.dp))
                    CountBadge(c.unread)
                }
                HorizontalDivider(color = HC.Border, modifier = Modifier.padding(start = 74.dp))
            }
        }
    }
}

@Composable
fun StaffChatScreen(conversation: Conversation, onBack: () -> Unit) {
    val id = conversation.stayId
    val model = remember(id) { ChatModel("staff", id, "/api/staff/stays/$id/messages", "/api/staff/stays/$id/read") }
    Column(Modifier.fillMaxSize()) {
        StaffHeader(conversation.guestName, "Room ${conversation.roomNumber} · Guest ID ${conversation.guestLogin}", onBack = onBack)
        HorizontalDivider(color = HC.Border)
        ChatPanel(model, otherName = conversation.guestName, emptyText = "No messages yet. Send a welcome note!")
    }
}
