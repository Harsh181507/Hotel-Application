package com.hotelconcierge.app.ui.staff

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowRight
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.TableRestaurant
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.hotelconcierge.app.data.Api
import com.hotelconcierge.app.data.DiningTable
import com.hotelconcierge.app.data.Session
import com.hotelconcierge.app.data.TableBooking
import com.hotelconcierge.app.data.jsonOf
import com.hotelconcierge.app.ui.TABLE_STATUS
import com.hotelconcierge.app.ui.addDays
import com.hotelconcierge.app.ui.common.EmptyState
import com.hotelconcierge.app.ui.common.Field
import com.hotelconcierge.app.ui.common.HcCard
import com.hotelconcierge.app.ui.common.HcChip
import com.hotelconcierge.app.ui.common.Loading
import com.hotelconcierge.app.ui.common.PrimaryButton
import com.hotelconcierge.app.ui.common.SecondaryButton
import com.hotelconcierge.app.ui.common.SectionLabel
import com.hotelconcierge.app.ui.common.SmallButton
import com.hotelconcierge.app.ui.common.StatusPill
import com.hotelconcierge.app.ui.dayChip
import com.hotelconcierge.app.ui.dayLong
import com.hotelconcierge.app.ui.theme.HC
import com.hotelconcierge.app.ui.time12
import kotlinx.coroutines.launch
import java.time.LocalDate

// Buttons for each booking status.
private val ACTIONS = mapOf(
    "confirmed" to listOf("seated" to "Seated", "no_show" to "No-show", "cancelled" to "Cancel"),
    "seated" to listOf("completed" to "Done"),
    "no_show" to listOf("confirmed" to "Restore"),
)

/** Day navigation used by the table and vehicle booking screens. */
@Composable
fun DayNav(date: String, today: String, onChange: (String) -> Unit) {
    Row(Modifier.padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        IconButton(onClick = { onChange(addDays(date, -1)) }) { Icon(Icons.AutoMirrored.Outlined.KeyboardArrowLeft, "Previous day") }
        Text(dayChip(date, today), fontWeight = FontWeight.SemiBold, modifier = Modifier.width(96.dp), textAlign = androidx.compose.ui.text.style.TextAlign.Center)
        IconButton(onClick = { onChange(addDays(date, 1)) }) { Icon(Icons.AutoMirrored.Outlined.KeyboardArrowRight, "Next day") }
        if (date != today) TextButton(onClick = { onChange(today) }) { Text("Today", color = HC.Maroon) }
    }
}

/** The restaurant's table bookings for a day, and (front desk) the list of tables. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun TablesScreen(session: Session.Staff, onBack: () -> Unit) {
    val scope = rememberCoroutineScope()
    val toast = rememberToast()
    val today = remember { LocalDate.now().toString() }
    var date by remember { mutableStateOf(today) }
    var bookings by remember { mutableStateOf<List<TableBooking>?>(null) }
    var tables by remember { mutableStateOf<List<DiningTable>?>(null) }
    var cancelling by remember { mutableStateOf<TableBooking?>(null) }
    var deleting by remember { mutableStateOf<DiningTable?>(null) }

    suspend fun load() { bookings = runCatching { Api.get<List<TableBooking>>("/api/staff/tables/bookings?date=$date") }.getOrDefault(emptyList()) }
    suspend fun loadTables() { if (session.isDesk) tables = runCatching { Api.get<List<DiningTable>>("/api/staff/tables") }.getOrDefault(emptyList()) }
    LaunchedEffect(date) { bookings = null; load() }
    LaunchedEffect(Unit) { loadTables() }
    OnLive("table:booked", "table:updated") { load() }

    fun setStatus(b: TableBooking, status: String) = scope.launch {
        runCatching { Api.send("PATCH", "/api/staff/tables/bookings/${b.id}", jsonOf("status" to status)) }.onFailure { toast(it.message ?: "Failed") }
        load()
    }
    fun act(block: suspend () -> Unit) = scope.launch { runCatching { block() }.onFailure { toast(it.message ?: "Failed") }; loadTables() }

    Column(Modifier.fillMaxSize()) {
        val active = bookings.orEmpty().filter { it.status != "cancelled" }
        val covers = active.filter { it.status != "no_show" }.sumOf { it.partySize }
        StaffHeader("Table bookings", "${dayLong(date)} · ${active.size} booking${if (active.size == 1) "" else "s"} · $covers guests", onBack = onBack)
        DayNav(date, today) { date = it }
        LazyColumn(contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 32.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            val list = bookings
            when {
                list == null -> item { Loading(Modifier.fillMaxWidth().padding(24.dp)) }
                list.isEmpty() -> item { EmptyState(Icons.Outlined.TableRestaurant, "No table bookings on this day.", Modifier.fillMaxWidth()) }
                else -> items(list, key = { it.id }) { b ->
                    val dim = b.status in setOf("cancelled", "completed", "no_show")
                    HcCard(Modifier.alpha(if (dim) 0.55f else 1f)) {
                        Column(Modifier.padding(14.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(time12(b.startLocal.substring(11)), fontFamily = FontFamily.Serif, fontSize = 20.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                                TABLE_STATUS[b.status]?.let { (l, tone) -> StatusPill(l, tone) }
                            }
                            Text("${b.partySize} ${if (b.partySize == 1) "person" else "people"} · Table ${b.tableName ?: "?"}", fontWeight = FontWeight.SemiBold)
                            Text("Room ${b.roomNumber} · ${b.guestName}", color = HC.Muted, style = MaterialTheme.typography.bodySmall)
                            if (b.note.isNotBlank()) Text("“${b.note}”", style = MaterialTheme.typography.bodySmall)
                            ACTIONS[b.status]?.let { actions ->
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 8.dp)) {
                                    actions.forEach { (status, label) ->
                                        SmallButton(label, { if (status == "cancelled") cancelling = b else setStatus(b, status) }, primary = status == "seated" || status == "completed")
                                    }
                                }
                            }
                        }
                    }
                }
            }

            val t = tables
            if (session.isDesk && t != null) {
                item { SectionLabel("Tables", Modifier.padding(top = 16.dp)) }
                item { Text("Guests are given the smallest free table that fits. Opening hours are in Settings.", color = HC.Muted, style = MaterialTheme.typography.bodySmall) }
                if (t.isEmpty()) {
                    item {
                        HcCard {
                            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                Text("No tables yet. Add yours below, or start with 10 sample tables (4 for 2, 4 for 4, 2 for 6) and rename them.", color = HC.Muted)
                                SecondaryButton("Add sample tables", { act { Api.send("POST", "/api/staff/tables/sample") } })
                            }
                        }
                    }
                }
                items(t, key = { "t${it.id}" }) { table ->
                    HcCard(Modifier.alpha(if (table.active) 1f else 0.55f)) {
                        Row(Modifier.padding(horizontal = 14.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                            Text(table.name, fontFamily = FontFamily.Serif, fontSize = 18.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.width(90.dp))
                            Text("${table.seats} seats", Modifier.weight(1f))
                            Switch(table.active, { on -> act { Api.send("PATCH", "/api/staff/tables/${table.id}", jsonOf("active" to on)) } }, colors = SwitchDefaults.colors(checkedTrackColor = HC.Green))
                            IconButton(onClick = { deleting = table }) { Icon(Icons.Outlined.Delete, "Delete table ${table.name}", tint = HC.Muted) }
                        }
                    }
                }
                item { AddTableForm { name, seats -> act { Api.send("POST", "/api/staff/tables", jsonOf("name" to name, "seats" to seats)) } } }
            }
        }
    }

    cancelling?.let { b ->
        ConfirmDialog("Cancel this booking?", "${b.partySize} people (Room ${b.roomNumber}) at ${time12(b.startLocal.substring(11))}. The guest will be told.", "Cancel booking", { setStatus(b, "cancelled") }, { cancelling = null })
    }
    deleting?.let { t ->
        ConfirmDialog("Delete table ${t.name}?", "Guests won't be able to book it any more.", "Delete", { act { Api.send("DELETE", "/api/staff/tables/${t.id}") } }, { deleting = null })
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun AddTableForm(onAdd: (String, Int) -> Unit) {
    var name by remember { mutableStateOf("") }
    var seats by remember { mutableIntStateOf(4) }
    HcCard {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("Add a table", style = MaterialTheme.typography.titleSmall)
            Field(name, { name = it.take(30) }, "Table name", placeholder = "e.g. T11 or Window 2")
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                listOf(2, 4, 6, 8, 10, 12).forEach { n -> HcChip("$n seats", seats == n, { seats = n }) }
            }
            PrimaryButton("Add table", { onAdd(name.trim(), seats); name = "" }, enabled = name.isNotBlank(), icon = Icons.Outlined.Add, modifier = Modifier.fillMaxWidth())
        }
    }
}

