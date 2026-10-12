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
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Assignment
import androidx.compose.material.icons.automirrored.outlined.Undo
import androidx.compose.material.icons.outlined.AccessAlarm
import androidx.compose.material.icons.outlined.Cancel
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.PanTool
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.hotelconcierge.app.data.Api
import com.hotelconcierge.app.data.ServiceRequest
import com.hotelconcierge.app.data.Session
import com.hotelconcierge.app.data.jsonOf
import com.hotelconcierge.app.ui.DEPARTMENTS
import com.hotelconcierge.app.ui.REQUEST_STATUS
import com.hotelconcierge.app.ui.common.EmptyState
import com.hotelconcierge.app.ui.common.HcCard
import com.hotelconcierge.app.ui.common.HcChip
import com.hotelconcierge.app.ui.common.Loading
import com.hotelconcierge.app.ui.common.SmallButton
import com.hotelconcierge.app.ui.common.StatusPill
import com.hotelconcierge.app.ui.common.Tone
import com.hotelconcierge.app.ui.requestKind
import com.hotelconcierge.app.ui.theme.HC
import com.hotelconcierge.app.ui.timeAgo
import kotlinx.coroutines.launch

private val FILTERS = listOf("open" to "New", "in_progress" to "Accepted", "done" to "Done", "" to "All")

/** Guest requests routed to departments. Department staff only get their own (the server makes sure). */
@Composable
fun TasksScreen(session: Session.Staff) {
    val scope = rememberCoroutineScope()
    val toast = rememberToast()
    var filter by remember { mutableStateOf("open") }
    var dept by remember { mutableStateOf("") }
    var list by remember { mutableStateOf<List<ServiceRequest>?>(null) }

    suspend fun load() {
        val q = buildList {
            if (filter.isNotEmpty()) add("status=$filter")
            if (session.isDesk && dept.isNotEmpty()) add("department=$dept")
        }.joinToString("&")
        list = runCatching { Api.get<List<ServiceRequest>>("/api/staff/requests?$q") }.getOrDefault(list ?: emptyList())
    }
    LaunchedEffect(filter, dept) { list = null; load() }
    OnLive("request:new", "request:updated", "request:escalated") { load() }

    fun setStatus(r: ServiceRequest, status: String, verb: String) = scope.launch {
        runCatching { Api.send("PATCH", "/api/staff/requests/${r.id}", jsonOf("status" to status)) }
            .onSuccess { toast("Room ${r.roomNumber}: $verb"); load() }
            .onFailure { toast(it.message ?: "Failed") }
    }

    Column(Modifier.fillMaxSize()) {
        StaffHeader(if (session.isDesk) "Tasks" else "${DEPARTMENTS[session.role]} tasks")
        LazyRow(contentPadding = PaddingValues(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            items(FILTERS) { (key, label) -> HcChip(label, filter == key, { filter = key }) }
        }
        if (session.isDesk) {
            LazyRow(contentPadding = PaddingValues(horizontal = 16.dp, vertical = 4.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                items(listOf("" to "All departments") + DEPARTMENTS.toList()) { (key, label) -> HcChip(label, dept == key, { dept = key }) }
            }
        }
        val rows = list ?: return Loading()
        if (rows.isEmpty()) return EmptyState(Icons.AutoMirrored.Outlined.Assignment, if (filter == "open") "All caught up. No new tasks." else "Nothing here.")
        LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            items(rows, key = { it.id }) { r ->
                val kind = requestKind(r.type)
                val late = r.escalatedAt != null && r.status == "open"
                HcCard(border = if (late) HC.Red else HC.Border) {
                    Column(Modifier.padding(16.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(kind.icon, null, tint = HC.GreenDark, modifier = Modifier.size(18.dp))
                            Text("  ${kind.label}", color = HC.GreenDark, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                            if (late) StatusPill("Late", Tone.Red, Icons.Outlined.AccessAlarm)
                            else REQUEST_STATUS[r.status]?.let { (label, tone) -> StatusPill(label, tone) }
                        }
                        Text("Room ${r.roomNumber}", fontFamily = FontFamily.Serif, fontSize = 22.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 6.dp))
                        Text(
                            "${r.guestName} · ${timeAgo(r.createdAt)}" + if (session.isDesk) " · ${DEPARTMENTS[r.department]}" else "",
                            color = HC.Muted, style = MaterialTheme.typography.bodySmall,
                        )
                        if (r.details.isNotBlank()) {
                            Text(r.details, modifier = Modifier.padding(top = 8.dp).fillMaxWidth().background(HC.Bg, RoundedCornerShape(12.dp)).padding(10.dp))
                        }
                        r.assignedName?.let { name ->
                            Row(Modifier.padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Outlined.Person, null, Modifier.size(15.dp), tint = HC.GreenDark)
                                Text(" ${if (r.assignedTo == session.id) "You" else name}", color = HC.GreenDark, fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodySmall)
                            }
                        }
                        Spacer(Modifier.height(12.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            if (r.status == "open") SmallButton("Accept", { setStatus(r, "in_progress", "accepted") }, Icons.Outlined.PanTool, primary = true)
                            if (r.status == "open" || r.status == "in_progress") SmallButton("Done", { setStatus(r, "done", "done") }, Icons.Outlined.CheckCircle, primary = r.status == "in_progress")
                            if (session.isDesk && (r.status == "open" || r.status == "in_progress")) SmallButton("Cancel", { setStatus(r, "cancelled", "cancelled") }, Icons.Outlined.Cancel)
                            if (session.isDesk && (r.status == "done" || r.status == "cancelled")) SmallButton("Reopen", { setStatus(r, "open", "reopened") }, Icons.AutoMirrored.Outlined.Undo)
                        }
                    }
                }
            }
        }
    }
}

