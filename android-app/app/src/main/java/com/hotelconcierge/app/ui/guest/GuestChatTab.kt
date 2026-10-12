package com.hotelconcierge.app.ui.guest

import androidx.compose.foundation.background
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
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.DoNotDisturbOn
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.hotelconcierge.app.data.Api
import com.hotelconcierge.app.data.GuestRoomState
import com.hotelconcierge.app.data.Live
import com.hotelconcierge.app.data.jsonOf
import com.hotelconcierge.app.ui.REQUEST_KINDS
import com.hotelconcierge.app.ui.RequestKind
import com.hotelconcierge.app.ui.common.ChatModel
import com.hotelconcierge.app.ui.common.ChatPanel
import com.hotelconcierge.app.ui.common.ErrorText
import com.hotelconcierge.app.ui.common.Field
import com.hotelconcierge.app.ui.common.HcChip
import com.hotelconcierge.app.ui.theme.HC
import kotlinx.coroutines.launch

/** Chat with the front desk (and the autopilot), quick requests and do-not-disturb. */
@Composable
fun GuestChatTab(onOpenMenu: () -> Unit) {
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val connected by Live.connected.collectAsState()
    val model = remember { ChatModel("guest", null, "/api/guest/messages", "/api/guest/messages/read") }
    var dnd by remember { mutableStateOf(false) }
    var asking by remember { mutableStateOf<RequestKind?>(null) }

    LaunchedEffect(Unit) { runCatching { Api.get<GuestRoomState>("/api/guest/room") }.onSuccess { dnd = it.dnd } }

    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().background(HC.Surface).padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(40.dp).background(HC.Green, CircleShape), contentAlignment = Alignment.Center) {
                Text("FD", color = Color.White, fontWeight = FontWeight.Bold)
            }
            Spacer(Modifier.width(12.dp))
            Column {
                Text("Front desk", style = MaterialTheme.typography.titleMedium)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(7.dp).background(if (connected) Color(0xFF4CAF7A) else HC.Border, CircleShape))
                    Text(if (connected) "  Online" else "  Connecting…", color = HC.Muted, style = MaterialTheme.typography.bodySmall)
                }
            }
        }
        LazyRow(
            contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            items(REQUEST_KINDS) { kind ->
                HcChip(kind.label, false, { if (kind.type == "food") onOpenMenu() else asking = kind }, icon = kind.icon)
            }
            item {
                HcChip(if (dnd) "Do not disturb: on" else "Do not disturb", dnd, {
                    scope.launch {
                        runCatching { Api.post<GuestRoomState>("/api/guest/room/dnd", jsonOf("on" to !dnd)) }
                            .onSuccess { dnd = it.dnd }
                            .onFailure { android.widget.Toast.makeText(context, it.message, android.widget.Toast.LENGTH_SHORT).show() }
                    }
                }, icon = Icons.Outlined.DoNotDisturbOn)
            }
        }
        HorizontalDivider(color = HC.Border)
        ChatPanel(model, otherName = "Front desk", emptyText = "Say hello! Ask anything (Wi-Fi, breakfast, check-out) or tell us what you need. We reply in seconds, day and night.")
    }

    asking?.let { kind ->
        var details by remember(kind) { mutableStateOf("") }
        var busy by remember(kind) { mutableStateOf(false) }
        var error by remember(kind) { mutableStateOf<String?>(null) }
        AlertDialog(
            onDismissRequest = { asking = null },
            icon = { Icon(kind.icon, null, tint = HC.Green) },
            title = { Text(kind.label) },
            text = {
                Column {
                    Field(details, { details = it.take(1000) }, "Details (optional)", placeholder = kind.hint, singleLine = false, minLines = 3)
                    Spacer(Modifier.height(8.dp))
                    ErrorText(error)
                }
            },
            confirmButton = {
                TextButton(enabled = !busy, onClick = {
                    scope.launch {
                        busy = true
                        runCatching { Api.send("POST", "/api/guest/requests", jsonOf("type" to kind.type, "details" to details.trim())) }
                            .onSuccess {
                                asking = null
                                model.loadLatest()
                                android.widget.Toast.makeText(context, "Request sent to the front desk", android.widget.Toast.LENGTH_SHORT).show()
                            }
                            .onFailure { error = it.message; busy = false }
                    }
                }) { Text("Send request") }
            },
            dismissButton = { TextButton(onClick = { asking = null }) { Text("Cancel") } },
            containerColor = HC.Surface,
        )
    }
}
