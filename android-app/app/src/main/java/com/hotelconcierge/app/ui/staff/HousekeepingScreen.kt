package com.hotelconcierge.app.ui.staff

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.CleaningServices
import androidx.compose.material.icons.outlined.DoNotDisturbOn
import androidx.compose.material.icons.outlined.Flag
import androidx.compose.material.icons.outlined.KingBed
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.PlayArrow
import androidx.compose.material.icons.outlined.Verified
import androidx.compose.material.icons.outlined.WbSunny
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.hotelconcierge.app.data.Api
import com.hotelconcierge.app.data.HkRoom
import com.hotelconcierge.app.data.Housekeeper
import com.hotelconcierge.app.data.LiveEvent
import com.hotelconcierge.app.data.Session
import com.hotelconcierge.app.data.decode
import com.hotelconcierge.app.data.jsonOf
import com.hotelconcierge.app.data.Live
import com.hotelconcierge.app.ui.HK_STATUS
import com.hotelconcierge.app.ui.common.EmptyState
import com.hotelconcierge.app.ui.common.Field
import com.hotelconcierge.app.ui.common.HcCard
import com.hotelconcierge.app.ui.common.HcChip
import com.hotelconcierge.app.ui.common.InfoText
import com.hotelconcierge.app.ui.common.Loading
import com.hotelconcierge.app.ui.common.PrimaryButton
import com.hotelconcierge.app.ui.common.SecondaryButton
import com.hotelconcierge.app.ui.common.StatusPill
import com.hotelconcierge.app.ui.common.Tone
import com.hotelconcierge.app.ui.theme.HC
import com.hotelconcierge.app.ui.timeAgo
import kotlinx.coroutines.launch

@Composable
private fun Flag(icon: ImageVector, text: String, red: Boolean = false) {
    Row(
        Modifier.clip(CircleShape).background(if (red) HC.RedSoft else HC.Surface2).padding(horizontal = 9.dp, vertical = 3.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, null, Modifier.size(13.dp), tint = if (red) Color(0xFF8C2F28) else HC.Text)
        Text(" $text", style = MaterialTheme.typography.labelSmall, color = if (red) Color(0xFF8C2F28) else HC.Text)
    }
}

/** Room cleaning: whole-hotel board for the front desk, "My rooms" for housekeepers. */
@OptIn(ExperimentalMaterial3Api::class, androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
fun HousekeepingScreen(session: Session.Staff) {
    val scope = rememberCoroutineScope()
    val toast = rememberToast()
    var rooms by remember { mutableStateOf<List<HkRoom>?>(null) }
    var staff by remember { mutableStateOf<List<Housekeeper>>(emptyList()) }
    var filter by remember { mutableStateOf("todo") }
    var showAll by remember { mutableStateOf(false) }
    var selected by remember { mutableStateOf<HkRoom?>(null) }
    var askDaily by remember { mutableStateOf(false) }

    suspend fun load() {
        rooms = runCatching { Api.get<List<HkRoom>>("/api/staff/housekeeping/rooms") }.getOrDefault(rooms ?: emptyList())
        if (session.isDesk) runCatching { Api.get<List<Housekeeper>>("/api/staff/housekeeping/staff") }.onSuccess { staff = it }
    }
    LaunchedEffect(Unit) { load() }
    LaunchedEffect(Unit) {
        Live.events.collect { e: LiveEvent ->
            when (e.name) {
                "room:updated" -> e.decode<HkRoom>()?.let { r ->
                    rooms = rooms?.map { if (it.id == r.id) r else it }
                    if (selected?.id == r.id) selected = r
                }
                "stay:updated", "connect" -> load()
            }
        }
    }

    fun setStatus(room: HkRoom, status: String) = scope.launch {
        runCatching { Api.post<HkRoom>("/api/staff/housekeeping/rooms/${room.id}/status", jsonOf("status" to status)) }
            .onSuccess { r ->
                rooms = rooms?.map { if (it.id == r.id) r else it }
                if (selected?.id == r.id) selected = r
                if (status == "clean") toast(if (r.status == "inspect") "Room ${r.number} sent for inspection" else "Room ${r.number} is ready")
            }
            .onFailure { toast(it.message ?: "Failed") }
    }

    val list = rooms
    Column(Modifier.fillMaxSize()) {
        if (list == null) return Loading()

        if (!session.isDesk) {
            // ---------- Housekeeper: my rooms ----------
            val mine = list.filter { it.status != "ready" && (showAll || it.assignedTo == session.id || it.assignedTo == null) }
                .sortedWith(compareByDescending<HkRoom> { it.priority }.thenBy { it.number.length }.thenBy { it.number })
            StaffHeader("My rooms", if (mine.isEmpty()) "All your rooms are clean. Great work!" else "Priority rooms are at the top")
            Row(Modifier.padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                Checkbox(showAll, { showAll = it })
                Text("Show rooms of other housekeepers too", style = MaterialTheme.typography.bodyMedium)
            }
            LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                items(mine, key = { it.id }) { r ->
                    val (label, tone) = HK_STATUS[r.status] ?: ("" to Tone.Grey)
                    HcCard(border = tone.fg.copy(alpha = 0.5f)) {
                        Column(Modifier.padding(16.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(r.number, fontFamily = FontFamily.Serif, fontSize = 32.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                                StatusPill(label, tone)
                            }
                            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.padding(vertical = 8.dp)) {
                                if (r.priority) Flag(Icons.Outlined.Flag, "Priority", red = true)
                                if (r.dnd) Flag(Icons.Outlined.DoNotDisturbOn, "Do not disturb")
                                Flag(Icons.Outlined.KingBed, if (r.occupied) "Guest staying" else "Empty")
                                if (r.assignedTo != session.id) Flag(Icons.Outlined.Person, r.assignedName ?: "Not assigned yet")
                            }
                            if (r.note.isNotBlank()) Text(r.note, modifier = Modifier.fillMaxWidth().background(HC.AmberSoft, RoundedCornerShape(10.dp)).padding(10.dp))
                            Spacer(Modifier.height(10.dp))
                            when (r.status) {
                                "dirty" -> PrimaryButton(
                                    if (r.dnd) "Guest asked not to disturb" else "Start cleaning", { setStatus(r, "cleaning") },
                                    enabled = !r.dnd, icon = Icons.Outlined.PlayArrow, modifier = Modifier.fillMaxWidth(),
                                )
                                "cleaning" -> PrimaryButton("Done cleaning", { setStatus(r, "clean") }, icon = Icons.Outlined.CheckCircle, modifier = Modifier.fillMaxWidth(), color = HC.Green)
                                "inspect" -> Text("Waiting for the front desk to check it.", color = HC.Muted)
                            }
                        }
                    }
                }
            }
            return@Column
        }

        // ---------- Front desk: whole-hotel board ----------
        fun count(s: String) = list.count { it.status == s }
        StaffHeader(
            "Housekeeping",
            "${count("dirty")} to clean · ${count("cleaning")} cleaning · ${count("inspect")} to check · ${count("ready")} ready",
        ) { SecondaryButton("Daily round", { askDaily = true }, icon = Icons.Outlined.WbSunny) }
        if (staff.isEmpty()) {
            Column(Modifier.padding(horizontal = 16.dp, vertical = 4.dp)) {
                InfoText("Add housekeepers in More → Team (with their floors) and rooms will be given to them automatically.")
            }
        }
        LazyRow(contentPadding = PaddingValues(horizontal = 16.dp, vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            items(listOf("todo" to "To do", "dirty" to "Dirty", "cleaning" to "Cleaning", "inspect" to "To check", "ready" to "Ready", "all" to "All")) { (k, l) ->
                HcChip(l, filter == k, { filter = k })
            }
        }
        val visible = list.filter { if (filter == "todo") it.status != "ready" else filter == "all" || it.status == filter }
        if (visible.isEmpty()) return@Column EmptyState(Icons.Outlined.CleaningServices, if (filter == "todo") "Every room is ready." else "Nothing here.")
        LazyVerticalGrid(GridCells.Adaptive(104.dp), contentPadding = PaddingValues(16.dp), horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            items(visible, key = { it.id }) { r ->
                val (_, tone) = HK_STATUS[r.status] ?: ("" to Tone.Grey)
                Surface(
                    onClick = { selected = r },
                    shape = RoundedCornerShape(14.dp),
                    color = if (r.status == "ready") HC.Surface else tone.bg,
                    border = BorderStroke(1.5.dp, if (r.status == "ready") HC.Border else tone.fg.copy(alpha = 0.35f)),
                ) {
                    Column(Modifier.padding(10.dp).heightIn(min = 70.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(r.number, fontFamily = FontFamily.Serif, fontSize = 20.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                            if (r.priority) Icon(Icons.Outlined.Flag, "Priority", Modifier.size(14.dp), tint = HC.Red)
                            if (r.dnd) Icon(Icons.Outlined.DoNotDisturbOn, "Do not disturb", Modifier.size(14.dp), tint = HC.Muted)
                            if (r.occupied) Icon(Icons.Outlined.KingBed, "Occupied", Modifier.size(14.dp), tint = HC.Muted)
                        }
                        Text(
                            mapOf("dirty" to "DIRTY", "cleaning" to "CLEANING", "inspect" to "INSPECT", "ready" to "READY")[r.status] ?: r.status,
                            style = MaterialTheme.typography.labelSmall, color = tone.fg,
                        )
                        Text(r.assignedName ?: if (r.status == "ready") "" else "Unassigned", style = MaterialTheme.typography.bodySmall, color = HC.Muted, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
            }
        }
    }

    selected?.let { room ->
        ModalBottomSheet(onDismissRequest = { selected = null }, containerColor = HC.Surface) {
            RoomSheet(room, staff, onStatus = { setStatus(room, it) }, onPatch = { body ->
                scope.launch {
                    runCatching { Api.patch<HkRoom>("/api/staff/housekeeping/rooms/${room.id}", body) }
                        .onSuccess { r -> rooms = rooms?.map { if (it.id == r.id) r else it }; selected = r }
                        .onFailure { toast(it.message ?: "Failed") }
                }
            })
        }
    }

    if (askDaily) {
        ConfirmDialog(
            "Start the daily round?", "Every occupied room that isn't on Do-not-disturb will be marked for its daily cleaning.", "Start",
            onConfirm = {
                scope.launch {
                    runCatching { Api.call("POST", "/api/staff/housekeeping/daily") }
                        .onSuccess { toast("Rooms added to today's cleaning"); load() }
                        .onFailure { toast(it.message ?: "Failed") }
                }
            },
            onDismiss = { askDaily = false },
        )
    }
}

@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
private fun RoomSheet(room: HkRoom, staff: List<Housekeeper>, onStatus: (String) -> Unit, onPatch: (kotlinx.serialization.json.JsonObject) -> Unit) {
    var note by remember(room.id) { mutableStateOf(room.note) }
    var menuOpen by remember { mutableStateOf(false) }
    val (label, tone) = HK_STATUS[room.status] ?: ("" to Tone.Grey)
    Column(Modifier.padding(horizontal = 20.dp).padding(bottom = 28.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Text("Room ${room.number}", style = MaterialTheme.typography.titleLarge)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            StatusPill(label, tone)
            Flag(Icons.Outlined.KingBed, if (room.occupied) "Guest staying" else "Empty")
            if (room.dnd) Flag(Icons.Outlined.DoNotDisturbOn, "Do not disturb")
            Text("updated ${timeAgo(room.updatedAt)}", color = HC.Muted, style = MaterialTheme.typography.bodySmall)
        }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            if (room.status != "dirty") SecondaryButton("Needs cleaning", { onStatus("dirty") }, icon = Icons.Outlined.CleaningServices)
            if (room.status == "dirty") SecondaryButton("Cleaning started", { onStatus("cleaning") }, icon = Icons.Outlined.PlayArrow)
            if (room.status != "ready") SecondaryButton(if (room.status == "inspect") "Approve: ready" else "Mark ready", { onStatus("ready") }, icon = Icons.Outlined.Verified)
        }
        Column {
            Text("Housekeeper", style = MaterialTheme.typography.labelMedium, color = HC.Muted)
            OutlinedButton(onClick = { menuOpen = true }, modifier = Modifier.fillMaxWidth(), border = BorderStroke(1.dp, HC.Border)) {
                Text(room.assignedName ?: "Nobody yet", color = HC.Text, modifier = Modifier.weight(1f))
            }
            DropdownMenu(menuOpen, { menuOpen = false }) {
                DropdownMenuItem(text = { Text("Nobody yet") }, onClick = { menuOpen = false; onPatch(jsonOf("assignedTo" to null)) })
                staff.forEach { h ->
                    DropdownMenuItem(
                        text = { Text("${h.name}${if (h.floors.isNotBlank()) " (floor ${h.floors})" else ""} · ${h.openRooms} open") },
                        onClick = { menuOpen = false; onPatch(jsonOf("assignedTo" to h.id)) },
                    )
                }
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Priority (clean first)", modifier = Modifier.weight(1f))
            Switch(room.priority, { onPatch(jsonOf("priority" to it)) }, colors = SwitchDefaults.colors(checkedTrackColor = HC.Green))
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Field(note, { note = it.take(200) }, "Note for housekeeping", placeholder = "e.g. Extra bed needed", modifier = Modifier.weight(1f))
            Spacer(Modifier.width(8.dp))
            SecondaryButton("Save", { onPatch(jsonOf("note" to note)) })
        }
    }
}

