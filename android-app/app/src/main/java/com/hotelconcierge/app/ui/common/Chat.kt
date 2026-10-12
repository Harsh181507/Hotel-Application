package com.hotelconcierge.app.ui.common

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.outlined.Done
import androidx.compose.material.icons.outlined.DoneAll
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.RoomService
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material.icons.outlined.SmartToy
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.hotelconcierge.app.data.Api
import com.hotelconcierge.app.data.Live
import com.hotelconcierge.app.data.LiveEvent
import com.hotelconcierge.app.data.Message
import com.hotelconcierge.app.data.MessagesRead
import com.hotelconcierge.app.data.Typing
import com.hotelconcierge.app.data.decode
import com.hotelconcierge.app.data.jsonOf
import com.hotelconcierge.app.ui.clockTime
import com.hotelconcierge.app.ui.dayLabel
import com.hotelconcierge.app.ui.theme.HC
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.json.JSONObject

private const val PAGE = 50

data class PendingMessage(val key: Long, val body: String, val failed: Boolean = false)

/**
 * Everything one chat needs. side = "guest" or "staff" (who is using this screen);
 * stayId = which conversation (null for the guest, who has only one).
 */
class ChatModel(val side: String, val stayId: Int?, private val messagesPath: String, val readPath: String) {
    val messages = mutableStateListOf<Message>()
    val pending = mutableStateListOf<PendingMessage>()
    var loading by mutableStateOf(true)
    var error by mutableStateOf<String?>(null)
    var hasMore by mutableStateOf(false)
    var loadingOlder by mutableStateOf(false)
    var otherTypingAt by mutableLongStateOf(0L)

    fun mine(m: Message) = if (side == "guest") m.sender == "guest" else m.sender == "staff" || m.sender == "bot"
    private fun fromOtherSide(m: Message, reader: String) = if (reader == "guest") m.sender != "guest" else m.sender == "guest"
    val unreadFromOther get() = messages.count { fromOtherSide(it, side) && it.readAt == null }

    private fun merge(rows: List<Message>) {
        val byId = LinkedHashMap<String, Message>()
        messages.forEach { byId[it.id] = it }
        rows.forEach { byId[it.id] = it }
        val sorted = byId.values.sortedBy { it.id.toLongOrNull() ?: 0L }
        messages.clear()
        messages.addAll(sorted)
    }

    suspend fun loadLatest(first: Boolean = false) {
        runCatching { Api.get<List<Message>>("$messagesPath?limit=$PAGE") }
            .onSuccess { rows ->
                if (first) { messages.clear(); hasMore = rows.size == PAGE }
                merge(rows)
                error = null
            }
            .onFailure { if (first) error = it.message }
        loading = false
    }

    suspend fun loadOlder() {
        if (loadingOlder || !hasMore || messages.isEmpty()) return
        loadingOlder = true
        runCatching { Api.get<List<Message>>("$messagesPath?limit=$PAGE&before=${messages.first().id}") }
            .onSuccess { merge(it); hasMore = it.size == PAGE }
        loadingOlder = false
    }

    suspend fun deliver(item: PendingMessage) {
        runCatching { Api.post<Message>(messagesPath, jsonOf("body" to item.body)) }
            .onSuccess { m -> pending.removeAll { it.key == item.key }; merge(listOf(m)) }
            .onFailure {
                val i = pending.indexOfFirst { it.key == item.key }
                if (i >= 0) pending[i] = item.copy(failed = true)
            }
    }

    fun handle(event: LiveEvent) {
        when (event.name) {
            "message:new" -> event.decode<Message>()?.let { m ->
                if (stayId == null || m.stayId == stayId) {
                    merge(listOf(m))
                    if (!mine(m)) otherTypingAt = 0L
                }
            }
            "messages:read" -> event.decode<MessagesRead>()?.let { r ->
                if (stayId != null && r.stayId != stayId) return
                val now = java.time.Instant.now().toString()
                for (i in messages.indices) {
                    val m = messages[i]
                    if (fromOtherSide(m, r.by) && m.readAt == null) messages[i] = m.copy(readAt = now)
                }
            }
            "typing" -> event.decode<Typing>()?.let { t ->
                val forMe = stayId == null || t.stayId == stayId
                val fromOther = if (side == "guest") t.from == "staff" else t.from == "guest"
                if (forMe && fromOther) otherTypingAt = System.currentTimeMillis()
            }
        }
    }
}

private sealed interface ChatRow {
    data class Day(val label: String) : ChatRow
    data class Msg(val m: Message) : ChatRow
    data class Pending(val p: PendingMessage) : ChatRow
    data object Typing : ChatRow
}

@Composable
fun ChatPanel(model: ChatModel, otherName: String, emptyText: String, active: Boolean = true, modifier: Modifier = Modifier) {
    val scope = rememberCoroutineScope()
    val listState = rememberLazyListState()
    var text by remember { mutableStateOf("") }
    var lastTypingSent by remember { mutableLongStateOf(0L) }
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }

    LaunchedEffect(model) { model.loadLatest(first = true) }
    LaunchedEffect(model) {
        Live.events.collect { e ->
            if (e.name == "connect") model.loadLatest() else model.handle(e)
        }
    }
    // "typing…" disappears after 4 seconds without news.
    LaunchedEffect(model.otherTypingAt) {
        now = System.currentTimeMillis()
        if (model.otherTypingAt > 0) { delay(4_100); now = System.currentTimeMillis() }
    }
    // Mark the other side's messages as read while the chat is on screen.
    val unread = model.unreadFromOther
    LaunchedEffect(unread, active) {
        if (active && unread > 0) {
            delay(400)
            runCatching { Api.send("POST", model.readPath) }
        }
    }
    // Load older messages when scrolled to the top.
    LaunchedEffect(listState, model) {
        snapshotFlow { listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0 }
            .collect { last -> if (last >= listState.layoutInfo.totalItemsCount - 3) model.loadOlder() }
    }

    val rows by remember(model) {
        derivedStateOf {
            val out = mutableListOf<ChatRow>()
            var day = ""
            model.messages.forEach { m ->
                val d = dayLabel(m.createdAt)
                if (d != day) { out += ChatRow.Day(d); day = d }
                out += ChatRow.Msg(m)
            }
            model.pending.forEach { out += ChatRow.Pending(it) }
            out
        }
    }
    val typing = model.otherTypingAt > 0 && now - model.otherTypingAt < 4_000

    Column(modifier.fillMaxSize()) {
        Box(Modifier.weight(1f).fillMaxWidth()) {
            when {
                model.loading -> Loading()
                model.error != null && model.messages.isEmpty() -> EmptyState(Icons.Outlined.RoomService, model.error ?: "")
                rows.isEmpty() -> EmptyState(Icons.Outlined.RoomService, emptyText)
                else -> LazyColumn(
                    state = listState,
                    reverseLayout = true,
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 14.dp, vertical = 12.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    if (typing) item(key = "typing") { TypingBubble() }
                    items(rows.asReversed(), key = { row ->
                        when (row) {
                            is ChatRow.Day -> "day-${row.label}"
                            is ChatRow.Msg -> "m-${row.m.id}"
                            is ChatRow.Pending -> "p-${row.p.key}"
                            ChatRow.Typing -> "typing"
                        }
                    }) { row ->
                        when (row) {
                            is ChatRow.Day -> DayLabel(row.label)
                            is ChatRow.Msg -> MessageBubble(row.m, model.mine(row.m), model.side, otherName)
                            is ChatRow.Pending -> PendingBubble(row.p) { scope.launch { model.pending.replaceAll { if (it.key == row.p.key) it.copy(failed = false) else it }; model.deliver(row.p) } }
                            ChatRow.Typing -> TypingBubble()
                        }
                    }
                    if (model.loadingOlder) item { Text("Loading earlier messages…", color = HC.Muted, modifier = Modifier.fillMaxWidth().padding(8.dp), style = MaterialTheme.typography.bodySmall) }
                }
            }
        }

        // Composer
        Row(
            Modifier.fillMaxWidth().background(HC.Surface).padding(horizontal = 12.dp, vertical = 8.dp),
            verticalAlignment = Alignment.Bottom,
        ) {
            OutlinedTextField(
                value = text,
                onValueChange = {
                    text = it.take(2000)
                    val t = System.currentTimeMillis()
                    if (t - lastTypingSent > 2_000) {
                        lastTypingSent = t
                        Live.emit("typing", if (model.stayId != null) JSONObject().put("stayId", model.stayId) else JSONObject())
                    }
                },
                placeholder = { Text("Type a message…") },
                modifier = Modifier.weight(1f),
                maxLines = 5,
                shape = RoundedCornerShape(24.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedContainerColor = HC.Surface, unfocusedContainerColor = HC.Input,
                    focusedBorderColor = HC.Green, unfocusedBorderColor = HC.Border,
                ),
            )
            Spacer(Modifier.width(8.dp))
            FilledIconButton(
                onClick = {
                    val body = text.trim()
                    if (body.isEmpty()) return@FilledIconButton
                    text = ""
                    val item = PendingMessage(System.nanoTime(), body)
                    model.pending.add(item)
                    scope.launch { model.deliver(item); listState.scrollToItem(0) }
                },
                enabled = text.isNotBlank(),
                modifier = Modifier.size(52.dp),
                colors = IconButtonDefaults.filledIconButtonColors(containerColor = HC.Maroon, disabledContainerColor = HC.Maroon.copy(alpha = 0.35f)),
            ) { Icon(Icons.AutoMirrored.Filled.Send, "Send", tint = Color.White) }
        }
    }
}

@Composable
private fun DayLabel(label: String) {
    Box(Modifier.fillMaxWidth().padding(vertical = 6.dp), contentAlignment = Alignment.Center) {
        Text(label, style = MaterialTheme.typography.bodySmall, color = HC.Muted, modifier = Modifier.background(HC.Surface2, CircleShape).padding(horizontal = 12.dp, vertical = 3.dp))
    }
}

@Composable
private fun MessageBubble(m: Message, mine: Boolean, side: String, otherName: String) {
    if (m.sender == "system") {
        Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
            Text(
                "${m.body}  ·  ${clockTime(m.createdAt)}",
                color = HC.GreenDark, style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.widthIn(max = 320.dp).background(HC.GreenSoft, RoundedCornerShape(14.dp)).padding(horizontal = 14.dp, vertical = 7.dp),
            )
        }
        return
    }
    val bot = m.sender == "bot"
    val bg = when {
        mine && bot -> Color(0xFF557F6B)
        mine -> HC.Green
        m.requestId != null -> Color(0xFFFBF3E4)
        else -> HC.Surface
    }
    val fg = if (mine) Color.White else HC.Text
    val shape = RoundedCornerShape(18.dp, 18.dp, if (mine) 6.dp else 18.dp, if (mine) 18.dp else 6.dp)
    Row(Modifier.fillMaxWidth(), horizontalArrangement = if (mine) Arrangement.End else Arrangement.Start) {
        Column(
            Modifier.widthIn(max = 300.dp).clip(shape).background(bg)
                .then(if (!mine) Modifier.border(BorderStroke(1.dp, if (m.requestId != null) HC.Amber else HC.Border), shape) else Modifier)
                .padding(horizontal = 13.dp, vertical = 8.dp),
        ) {
            if (bot) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Outlined.SmartToy, null, Modifier.size(13.dp), tint = if (mine) Color(0xFFD9EADF) else HC.Green)
                    Spacer(Modifier.width(4.dp))
                    Text(if (side == "guest") "$otherName · auto-reply" else "Auto-reply", style = MaterialTheme.typography.labelSmall, color = if (mine) Color(0xFFD9EADF) else HC.Green)
                }
            } else if (!mine && side == "guest") {
                Text(otherName, style = MaterialTheme.typography.labelSmall, color = HC.Maroon, fontWeight = FontWeight.Bold)
            }
            if (m.requestId != null) Text("SERVICE REQUEST", style = MaterialTheme.typography.labelSmall, color = fg.copy(alpha = 0.75f))
            Text(m.body, color = fg, style = MaterialTheme.typography.bodyLarge)
            Row(Modifier.align(Alignment.End), verticalAlignment = Alignment.CenterVertically) {
                Text(clockTime(m.createdAt), color = fg.copy(alpha = 0.7f), style = MaterialTheme.typography.bodySmall)
                if (mine && !bot) {
                    Spacer(Modifier.width(4.dp))
                    Icon(
                        if (m.readAt != null) Icons.Outlined.DoneAll else Icons.Outlined.Done,
                        if (m.readAt != null) "Read" else "Sent",
                        Modifier.size(14.dp),
                        tint = if (m.readAt != null) Color(0xFFBFE8CF) else fg.copy(alpha = 0.7f),
                    )
                }
            }
        }
    }
}

@Composable
private fun PendingBubble(p: PendingMessage, onRetry: () -> Unit) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
        Column(
            Modifier.widthIn(max = 300.dp).clip(RoundedCornerShape(18.dp))
                .background(if (p.failed) HC.RedSoft else HC.Green.copy(alpha = 0.7f))
                .then(if (p.failed) Modifier.clickable(onClick = onRetry) else Modifier)
                .padding(horizontal = 13.dp, vertical = 8.dp),
        ) {
            Text(p.body, color = if (p.failed) Color(0xFF8C2F28) else Color.White)
            Row(Modifier.align(Alignment.End), verticalAlignment = Alignment.CenterVertically) {
                Icon(if (p.failed) Icons.Outlined.Refresh else Icons.Outlined.Schedule, null, Modifier.size(12.dp), tint = if (p.failed) Color(0xFF8C2F28) else Color.White)
                Text(if (p.failed) " Not sent · tap to retry" else " Sending", style = MaterialTheme.typography.bodySmall, color = if (p.failed) Color(0xFF8C2F28) else Color.White)
            }
        }
    }
}

@Composable
private fun TypingBubble() {
    Row(Modifier.fillMaxWidth()) {
        Text("typing…", color = HC.Muted, style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.background(HC.Surface, RoundedCornerShape(18.dp)).border(1.dp, HC.Border, RoundedCornerShape(18.dp)).padding(horizontal = 14.dp, vertical = 8.dp))
    }
}
