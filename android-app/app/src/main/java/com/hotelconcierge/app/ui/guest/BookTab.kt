package com.hotelconcierge.app.ui.guest

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.DirectionsCar
import androidx.compose.material.icons.outlined.EventAvailable
import androidx.compose.material.icons.outlined.Group
import androidx.compose.material.icons.outlined.Phone
import androidx.compose.material.icons.outlined.Remove
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material.icons.outlined.TableRestaurant
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import com.hotelconcierge.app.data.Api
import com.hotelconcierge.app.data.GuestInfo
import com.hotelconcierge.app.data.Live
import com.hotelconcierge.app.data.TableBooking
import com.hotelconcierge.app.data.TableDay
import com.hotelconcierge.app.data.Vehicle
import com.hotelconcierge.app.data.VehicleBooking
import com.hotelconcierge.app.data.jsonOf
import com.hotelconcierge.app.ui.HALF_HOURS
import com.hotelconcierge.app.ui.PRICE_UNIT
import com.hotelconcierge.app.ui.TABLE_STATUS
import com.hotelconcierge.app.ui.VEHICLE_DURATIONS
import com.hotelconcierge.app.ui.VEHICLE_STATUS
import com.hotelconcierge.app.ui.addDays
import com.hotelconcierge.app.ui.addMinutesLocal
import com.hotelconcierge.app.ui.common.EmptyState
import com.hotelconcierge.app.ui.common.Field
import com.hotelconcierge.app.ui.common.HcCard
import com.hotelconcierge.app.ui.common.HcChip
import com.hotelconcierge.app.ui.common.InfoText
import com.hotelconcierge.app.ui.common.Loading
import com.hotelconcierge.app.ui.common.PrimaryButton
import com.hotelconcierge.app.ui.common.SectionLabel
import com.hotelconcierge.app.ui.common.StatusPill
import com.hotelconcierge.app.ui.common.Tone
import com.hotelconcierge.app.ui.dayChip
import com.hotelconcierge.app.ui.dayLong
import com.hotelconcierge.app.ui.localMinutes
import com.hotelconcierge.app.ui.pct
import com.hotelconcierge.app.ui.rangeLabel
import com.hotelconcierge.app.ui.rupees
import com.hotelconcierge.app.ui.staff.rememberToast
import com.hotelconcierge.app.ui.theme.HC
import com.hotelconcierge.app.ui.time12
import com.hotelconcierge.app.ui.vehiclePrice
import kotlinx.coroutines.launch
import java.time.Instant

private const val DAYS_SHOWN = 7L

/** Guests book a restaurant table or one of the hotel's vehicles. */
@Composable
fun BookTab(info: GuestInfo?) {
    var kind by rememberSaveable { mutableStateOf("table") }
    if (info == null) return Loading()
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text("Book", style = MaterialTheme.typography.headlineMedium)
        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(HC.Surface2).padding(4.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            listOf("table" to ("Restaurant table" to Icons.Outlined.TableRestaurant), "vehicle" to ("Vehicle" to Icons.Outlined.DirectionsCar)).forEach { (key, v) ->
                val on = kind == key
                Surface(
                    onClick = { kind = key }, modifier = Modifier.weight(1f), shape = RoundedCornerShape(10.dp),
                    color = if (on) HC.Surface else Color.Transparent, shadowElevation = if (on) 1.dp else 0.dp,
                ) {
                    Row(Modifier.padding(vertical = 10.dp), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
                        Icon(v.second, null, Modifier.size(18.dp), tint = if (on) HC.Text else HC.Muted)
                        Text("  ${v.first}", fontWeight = FontWeight.SemiBold, color = if (on) HC.Text else HC.Muted)
                    }
                }
            }
        }
        if (kind == "table") TableBookingSection(info) else VehicleBookingSection(info)
    }
}

@Composable
private fun DayChips(today: String, value: String, onChange: (String) -> Unit) {
    LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        items((0 until DAYS_SHOWN).map { addDays(today, it) }) { d -> HcChip(dayChip(d, today), d == value, { onChange(d) }) }
    }
}

@Composable
private fun Label(text: String) = Text(text.uppercase(), style = MaterialTheme.typography.labelMedium, color = HC.Muted, modifier = Modifier.padding(top = 6.dp))

// ---------- Restaurant table ----------

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun TableBookingSection(info: GuestInfo) {
    val scope = rememberCoroutineScope()
    val toast = rememberToast()
    val today = info.today
    var date by remember { mutableStateOf(today) }
    var people by remember { mutableIntStateOf(2) }
    var day by remember { mutableStateOf<TableDay?>(null) }
    var time by remember { mutableStateOf<String?>(null) }
    var note by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var mine by remember { mutableStateOf<List<TableBooking>>(emptyList()) }
    var cancelling by remember { mutableStateOf<TableBooking?>(null) }

    suspend fun loadSlots() { day = runCatching { Api.get<TableDay>("/api/guest/tables/slots?date=$date&people=$people") }.getOrNull() }
    suspend fun loadMine() { runCatching { Api.get<List<TableBooking>>("/api/guest/tables/bookings") }.onSuccess { mine = it } }
    LaunchedEffect(date, people) { time = null; loadSlots() }
    LaunchedEffect(Unit) { loadMine() }
    LaunchedEffect(Unit) { Live.events.collect { if (it.name in setOf("table:updated", "table:booked", "connect")) { loadSlots(); loadMine() } } }

    if (info.restaurant.tables == 0) {
        EmptyState(Icons.Outlined.TableRestaurant, "Table booking isn't set up yet. Please message the front desk to reserve a table.", Modifier.fillMaxWidth())
        return
    }
    val maxPeople = maxOf(1, day?.maxSeats ?: 12)

    Text("Restaurant open ${time12(info.restaurant.open)} – ${time12(info.restaurant.close)}. Your table is kept for ${info.restaurant.minutes} minutes.", color = HC.Muted, style = MaterialTheme.typography.bodySmall)
    Label("Day")
    DayChips(today, date) { date = it }
    Label("Guests")
    Row(Modifier.clip(RoundedCornerShape(12.dp)).background(HC.Green), verticalAlignment = Alignment.CenterVertically) {
        Icon(Icons.Outlined.Remove, "Fewer people", tint = Color.White, modifier = Modifier.clickable { people = maxOf(1, people - 1) }.padding(12.dp).size(18.dp))
        Icon(Icons.Outlined.Group, null, tint = Color.White, modifier = Modifier.size(18.dp))
        Text("  $people ${if (people == 1) "person" else "people"}", color = Color.White, fontWeight = FontWeight.Bold, modifier = Modifier.widthIn(min = 90.dp))
        Icon(Icons.Outlined.Add, "More people", tint = Color.White, modifier = Modifier.clickable { people = minOf(maxPeople, people + 1) }.padding(12.dp).size(18.dp))
    }
    Label("Time")
    val d = day
    when {
        d == null -> Loading(Modifier.fillMaxWidth().height(60.dp))
        d.slots.none { it.available } -> InfoText(
            if (people > d.maxSeats) "Our biggest table seats ${d.maxSeats}. Please message the front desk for a bigger group." else "No free tables on this day. Please try another day.",
        )
        else -> FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            d.slots.forEach { s ->
                val on = time == s.time
                Surface(
                    onClick = { time = s.time }, enabled = s.available, shape = RoundedCornerShape(12.dp),
                    color = when { on -> HC.Green; s.available -> HC.Surface; else -> HC.Surface2 },
                    border = BorderStroke(1.dp, if (on) HC.Green else HC.Border),
                ) {
                    Text(
                        time12(s.time), modifier = Modifier.width(80.dp).padding(vertical = 9.dp), fontWeight = FontWeight.SemiBold,
                        color = when { on -> Color.White; s.available -> HC.Text; else -> HC.Muted.copy(alpha = 0.6f) },
                        textDecoration = if (s.available) null else TextDecoration.LineThrough,
                        textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                    )
                }
            }
        }
    }
    Text("Greyed-out times are fully booked (or already past).", color = HC.Muted, style = MaterialTheme.typography.bodySmall)

    time?.let { t ->
        Field(note, { note = it.take(300) }, "Anything we should know? (optional)", placeholder = "e.g. birthday, high chair, window seat", singleLine = false)
        PrimaryButton("Book table for $people · ${dayChip(date, today)} ${time12(t)}", {
            scope.launch {
                busy = true
                runCatching { Api.send("POST", "/api/guest/tables/bookings", jsonOf("date" to date, "time" to t, "people" to people, "note" to note)) }
                    .onSuccess { toast("Table booked for $people at ${time12(t)}"); time = null; note = ""; loadMine() }
                    .onFailure { toast(it.message ?: "Couldn't book") }
                busy = false
                loadSlots()
            }
        }, loading = busy, modifier = Modifier.fillMaxWidth())
    }

    val upcoming = mine.filter { it.status == "confirmed" || it.status == "seated" }
    if (upcoming.isNotEmpty()) {
        Spacer(Modifier.height(6.dp))
        SectionLabel("Your table bookings")
        upcoming.forEach { b ->
            HcCard {
                Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Outlined.EventAvailable, null, tint = HC.Green)
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text("${dayLong(b.startLocal.take(10))}, ${time12(b.startLocal.substring(11))}", fontWeight = FontWeight.SemiBold)
                        Text("${b.partySize} ${if (b.partySize == 1) "person" else "people"} · table ${b.tableName ?: "-"}${if (b.note.isNotBlank()) " · ${b.note}" else ""}", color = HC.Muted, style = MaterialTheme.typography.bodySmall)
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            TABLE_STATUS[b.status]?.let { (l, tone) -> StatusPill(l, tone) }
                            if (b.status == "confirmed") TextButton(onClick = { cancelling = b }) { Text("Cancel", color = HC.Maroon) }
                        }
                    }
                }
            }
        }
    }

    cancelling?.let { b ->
        AlertDialog(
            onDismissRequest = { cancelling = null },
            title = { Text("Cancel this table?") },
            text = { Text("${b.partySize} people on ${dayLong(b.startLocal.take(10))} at ${time12(b.startLocal.substring(11))}.") },
            confirmButton = {
                TextButton(onClick = {
                    cancelling = null
                    scope.launch {
                        runCatching { Api.send("POST", "/api/guest/tables/bookings/${b.id}/cancel") }.onFailure { toast(it.message ?: "Failed") }
                        loadMine(); loadSlots()
                    }
                }) { Text("Cancel booking", color = HC.Maroon) }
            },
            dismissButton = { TextButton(onClick = { cancelling = null }) { Text("Keep it") } },
            containerColor = HC.Surface,
        )
    }
}

// ---------- Vehicle ----------

private fun firstTimeToday(now: String): String? {
    val (h, m) = now.split(":").map { it.toInt() }
    val mins = h * 60 + m + 30
    return if (mins >= 1440) null else HALF_HOURS.getOrNull((mins + 29) / 30)
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun VehicleBookingSection(info: GuestInfo) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val toast = rememberToast()
    val today = info.today
    val firstToday = remember(info.time) { firstTimeToday(info.time) }
    var date by remember { mutableStateOf(today) }
    val times = if (date == today) HALF_HOURS.filter { firstToday != null && it >= firstToday } else HALF_HOURS
    var time by remember { mutableStateOf(if (firstToday != null && firstToday > "09:00") firstToday else "10:00") }
    var hours by remember { mutableIntStateOf(2) }
    var vehicles by remember { mutableStateOf<List<Vehicle>?>(null) }
    var mine by remember { mutableStateOf<List<VehicleBooking>>(emptyList()) }
    var confirm by remember { mutableStateOf<Vehicle?>(null) }
    var cancelling by remember { mutableStateOf<VehicleBooking?>(null) }
    var busyId by remember { mutableStateOf<Int?>(null) }
    var timeMenu by remember { mutableStateOf(false) }

    suspend fun load() { vehicles = runCatching { Api.get<List<Vehicle>>("/api/guest/vehicles?date=$date") }.getOrDefault(emptyList()) }
    suspend fun loadMine() { runCatching { Api.get<List<VehicleBooking>>("/api/guest/vehicles/bookings") }.onSuccess { mine = it } }
    LaunchedEffect(date) { load() }
    LaunchedEffect(Unit) { loadMine() }
    LaunchedEffect(times) { if (time !in times) times.firstOrNull()?.let { time = it } }
    LaunchedEffect(Unit) { Live.events.collect { if (it.name in setOf("vehicle:updated", "vehicle:booked", "connect")) { load(); loadMine() } } }

    val start = "$date $time"
    val end = addMinutesLocal(start, hours * 60L)
    fun clashOf(v: Vehicle) = v.booked.firstOrNull { localMinutes(it.startLocal) < localMinutes(end) && localMinutes(it.endLocal) > localMinutes(start) }

    Label("Day")
    DayChips(today, date) { date = it }
    Label("From")
    Box {
        OutlinedButton(onClick = { timeMenu = true }, border = BorderStroke(1.dp, HC.Border), enabled = times.isNotEmpty()) {
            Icon(Icons.Outlined.Schedule, null, Modifier.size(18.dp), tint = HC.Text)
            Text("  ${if (times.isEmpty()) "Too late for today" else time12(time)}", color = HC.Text)
        }
        DropdownMenu(timeMenu, { timeMenu = false }, Modifier.height(320.dp)) {
            times.forEach { t -> DropdownMenuItem(text = { Text(time12(t)) }, onClick = { time = t; timeMenu = false }) }
        }
    }
    Label("For")
    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        VEHICLE_DURATIONS.forEach { (h, label) -> HcChip(label, hours == h, { hours = h }) }
    }
    if (times.isEmpty()) InfoText("It's too late to book for today. Please pick another day.")

    val list = vehicles
    when {
        list == null -> Loading(Modifier.fillMaxWidth().height(80.dp))
        list.isEmpty() -> EmptyState(Icons.Outlined.DirectionsCar, "No vehicles are available right now. Please message the front desk.", Modifier.fillMaxWidth())
        else -> list.forEach { v ->
            val clash = clashOf(v)
            val price = vehiclePrice(v, hours)
            HcCard(border = if (clash != null) HC.Red.copy(alpha = 0.3f) else HC.Border) {
                Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(44.dp).clip(RoundedCornerShape(12.dp)).background(HC.GreenSoft), contentAlignment = Alignment.Center) {
                            Icon(Icons.Outlined.DirectionsCar, null, tint = HC.Green)
                        }
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) {
                            Text(v.name.ifBlank { v.type }, fontWeight = FontWeight.SemiBold)
                            Text(listOf(v.type, "${v.seats} seats", v.plateNumber).filter { it.isNotBlank() }.joinToString(" · "), color = HC.Muted, style = MaterialTheme.typography.bodySmall)
                            if (v.note.isNotBlank()) Text(v.note, color = HC.Muted, style = MaterialTheme.typography.bodySmall)
                        }
                        Column(horizontalAlignment = Alignment.End) {
                            Text(rupees(v.pricePaise), fontWeight = FontWeight.Bold)
                            Text(PRICE_UNIT[v.priceUnit] ?: "", color = HC.Muted, style = MaterialTheme.typography.bodySmall)
                        }
                    }
                    if (v.booked.isNotEmpty()) {
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text("${if (v.busyNow) "Out now. " else ""}Booked ${dayChip(date, today).lowercase()}:", color = HC.Muted, style = MaterialTheme.typography.bodySmall)
                            v.booked.forEach { b -> StatusPill(rangeLabel(b.startLocal, b.endLocal, date), Tone.Grey) }
                        }
                    }
                    if (clash != null) {
                        Text(
                            "Already booked at this time (${rangeLabel(clash.startLocal, clash.endLocal, date)}). Try another time.",
                            color = Color(0xFF8C2F28), fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodySmall,
                            modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(HC.RedSoft).padding(10.dp),
                        )
                    } else {
                        PrimaryButton(
                            "Book · ${rupees(price)}${if (info.taxes.vehiclePct > 0) " + GST" else ""}", { confirm = v },
                            enabled = times.isNotEmpty(), loading = busyId == v.id, modifier = Modifier.fillMaxWidth(),
                        )
                    }
                }
            }
        }
    }

    val upcoming = mine.filter { it.status == "confirmed" }
    if (upcoming.isNotEmpty()) {
        Spacer(Modifier.height(6.dp))
        SectionLabel("Your vehicle bookings")
        upcoming.forEach { b ->
            HcCard {
                Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Outlined.DirectionsCar, null, tint = HC.Green)
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text(b.vehicle.name.ifBlank { b.vehicle.type } + if (b.vehicle.plateNumber.isNotBlank()) " · ${b.vehicle.plateNumber}" else "", fontWeight = FontWeight.SemiBold)
                        Text("${rangeLabel(b.startLocal, b.endLocal)} · ${rupees(b.pricePaise)}", color = HC.Muted, style = MaterialTheme.typography.bodySmall)
                        if (b.vehicle.driverName.isNotBlank() || b.vehicle.driverPhone.isNotBlank()) {
                            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.clickable(enabled = b.vehicle.driverPhone.isNotBlank()) {
                                context.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + b.vehicle.driverPhone.filter { it.isDigit() || it == '+' })))
                            }) {
                                Text("Driver: ${b.vehicle.driverName} ", style = MaterialTheme.typography.bodySmall)
                                if (b.vehicle.driverPhone.isNotBlank()) {
                                    Icon(Icons.Outlined.Phone, null, Modifier.size(13.dp), tint = HC.Green)
                                    Text(" ${b.vehicle.driverPhone}", color = HC.Green, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.SemiBold)
                                }
                            }
                        }
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            VEHICLE_STATUS[b.status]?.let { (l, tone) -> StatusPill(l, tone) }
                            if (Instant.parse(b.startsAt).isAfter(Instant.now())) TextButton(onClick = { cancelling = b }) { Text("Cancel", color = HC.Maroon) }
                        }
                    }
                }
            }
        }
    }

    confirm?.let { v ->
        val price = vehiclePrice(v, hours)
        AlertDialog(
            onDismissRequest = { confirm = null },
            title = { Text("Book ${v.name.ifBlank { v.type }}?") },
            text = {
                Text("${rangeLabel(start, end)}\n${rupees(price)}${if (info.taxes.vehiclePct > 0) " + ${pct(info.taxes.vehiclePct)}% GST" else ""}, added to your room bill.")
            },
            confirmButton = {
                TextButton(onClick = {
                    confirm = null
                    scope.launch {
                        busyId = v.id
                        runCatching { Api.send("POST", "/api/guest/vehicles/bookings", jsonOf("vehicleId" to v.id, "date" to date, "time" to time, "hours" to hours)) }
                            .onSuccess { toast("Vehicle booked. The driver's details are below."); loadMine() }
                            .onFailure { toast(it.message ?: "Couldn't book") }
                        busyId = null
                        load()
                    }
                }) { Text("Book", color = HC.Maroon) }
            },
            dismissButton = { TextButton(onClick = { confirm = null }) { Text("Not now") } },
            containerColor = HC.Surface,
        )
    }

    cancelling?.let { b ->
        AlertDialog(
            onDismissRequest = { cancelling = null },
            title = { Text("Cancel this booking?") },
            text = { Text("${b.vehicle.name.ifBlank { b.vehicle.type }}, ${rangeLabel(b.startLocal, b.endLocal)}. It will be removed from your bill.") },
            confirmButton = {
                TextButton(onClick = {
                    cancelling = null
                    scope.launch {
                        runCatching { Api.send("POST", "/api/guest/vehicles/bookings/${b.id}/cancel") }.onFailure { toast(it.message ?: "Failed") }
                        loadMine(); load()
                    }
                }) { Text("Cancel booking", color = HC.Maroon) }
            },
            dismissButton = { TextButton(onClick = { cancelling = null }) { Text("Keep it") } },
            containerColor = HC.Surface,
        )
    }
}

