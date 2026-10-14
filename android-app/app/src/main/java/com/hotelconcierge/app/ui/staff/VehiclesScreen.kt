package com.hotelconcierge.app.ui.staff

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.DirectionsCar
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.hotelconcierge.app.data.Api
import com.hotelconcierge.app.data.Vehicle
import com.hotelconcierge.app.data.VehicleBooking
import com.hotelconcierge.app.data.jsonOf
import com.hotelconcierge.app.ui.PRICE_UNIT
import com.hotelconcierge.app.ui.VEHICLE_STATUS
import com.hotelconcierge.app.ui.common.EmptyState
import com.hotelconcierge.app.ui.common.ErrorText
import com.hotelconcierge.app.ui.common.Field
import com.hotelconcierge.app.ui.common.HcCard
import com.hotelconcierge.app.ui.common.HcChip
import com.hotelconcierge.app.ui.common.Loading
import com.hotelconcierge.app.ui.common.PrimaryButton
import com.hotelconcierge.app.ui.common.SecondaryButton
import com.hotelconcierge.app.ui.common.SectionLabel
import com.hotelconcierge.app.ui.common.SmallButton
import com.hotelconcierge.app.ui.common.StatusPill
import com.hotelconcierge.app.ui.dayLong
import com.hotelconcierge.app.ui.rangeLabel
import com.hotelconcierge.app.ui.rupees
import com.hotelconcierge.app.ui.theme.HC
import com.hotelconcierge.app.ui.time12
import kotlinx.coroutines.launch
import java.time.LocalDate

private val TYPES = listOf("Car", "SUV", "Sedan", "Hatchback", "Tempo Traveller", "Bus", "Bike", "Scooter", "Auto")

/** Vehicle bookings for a day, and the hotel's vehicles (front desk). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun VehiclesScreen(onBack: () -> Unit) {
    val scope = rememberCoroutineScope()
    val toast = rememberToast()
    val today = remember { LocalDate.now().toString() }
    var date by remember { mutableStateOf(today) }
    var bookings by remember { mutableStateOf<List<VehicleBooking>?>(null) }
    var vehicles by remember { mutableStateOf<List<Vehicle>?>(null) }
    var editing by remember { mutableStateOf<Vehicle?>(null) }
    var adding by remember { mutableStateOf(false) }
    var cancelling by remember { mutableStateOf<VehicleBooking?>(null) }
    var removing by remember { mutableStateOf<Vehicle?>(null) }

    suspend fun load() { bookings = runCatching { Api.get<List<VehicleBooking>>("/api/staff/vehicles/bookings?date=$date") }.getOrDefault(emptyList()) }
    suspend fun loadVehicles() { vehicles = runCatching { Api.get<List<Vehicle>>("/api/staff/vehicles") }.getOrDefault(emptyList()) }
    LaunchedEffect(date) { bookings = null; load() }
    LaunchedEffect(Unit) { loadVehicles() }
    OnLive("vehicle:booked", "vehicle:updated") { load() }

    fun setStatus(b: VehicleBooking, status: String) = scope.launch {
        runCatching { Api.send("PATCH", "/api/staff/vehicles/bookings/${b.id}", jsonOf("status" to status)) }.onFailure { toast(it.message ?: "Failed") }
        load()
    }
    fun save(v: Vehicle, id: Int?, onDone: () -> Unit = {}, onError: (String) -> Unit = { toast(it) }) = scope.launch {
        val body = jsonOf(
            "type" to v.type, "name" to v.name, "plateNumber" to v.plateNumber, "seats" to v.seats, "driverName" to v.driverName.orEmpty(),
            "driverPhone" to v.driverPhone.orEmpty(), "pricePaise" to v.pricePaise, "priceUnit" to v.priceUnit, "available" to v.available, "note" to v.note,
        )
        runCatching { if (id == null) Api.send("POST", "/api/staff/vehicles", body) else Api.send("PUT", "/api/staff/vehicles/$id", body) }
            .onSuccess { onDone(); loadVehicles() }
            .onFailure { onError(it.message ?: "Failed") }
    }

    Column(Modifier.fillMaxSize()) {
        val active = bookings.orEmpty().count { it.status != "cancelled" }
        StaffHeader("Vehicles", "${dayLong(date)} · $active booking${if (active == 1) "" else "s"}", onBack = onBack) {
            SecondaryButton("Add", { adding = true }, icon = Icons.Outlined.Add)
        }
        DayNav(date, today) { date = it }
        LazyColumn(contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 32.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            val list = bookings
            when {
                list == null -> item { Loading(Modifier.fillMaxWidth().padding(24.dp)) }
                list.isEmpty() -> item { EmptyState(Icons.Outlined.DirectionsCar, "No vehicle bookings on this day.", Modifier.fillMaxWidth()) }
                else -> items(list, key = { it.id }) { b ->
                    HcCard(Modifier.alpha(if (b.status == "confirmed") 1f else 0.55f)) {
                        Column(Modifier.padding(14.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(
                                    if (b.startLocal.take(10) == date) time12(b.startLocal.substring(11)) else "Earlier",
                                    style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f),
                                )
                                VEHICLE_STATUS[b.status]?.let { (l, tone) -> StatusPill(l, tone) }
                            }
                            Text(b.vehicle.name.ifBlank { b.vehicle.type } + if (b.vehicle.plateNumber.isNotBlank()) " · ${b.vehicle.plateNumber}" else "", fontWeight = FontWeight.SemiBold)
                            Text("${rangeLabel(b.startLocal, b.endLocal, date)} · Room ${b.roomNumber} · ${b.guestName} · ${rupees(b.pricePaise)}", color = HC.Muted, style = MaterialTheme.typography.bodySmall)
                            if (b.vehicle.driverName.isNotBlank()) Text("Driver ${b.vehicle.driverName}${if (b.vehicle.driverPhone.isNotBlank()) " · ${b.vehicle.driverPhone}" else ""}", style = MaterialTheme.typography.bodySmall)
                            if (b.note.isNotBlank()) Text("“${b.note}”", style = MaterialTheme.typography.bodySmall)
                            if (b.status == "confirmed") {
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 8.dp)) {
                                    SmallButton("Done", { setStatus(b, "completed") }, primary = true)
                                    SmallButton("Cancel", { cancelling = b })
                                }
                            }
                        }
                    }
                }
            }

            item { SectionLabel("Our vehicles", Modifier.padding(top = 16.dp)) }
            val fleet = vehicles
            when {
                fleet == null -> item { Loading(Modifier.fillMaxWidth().padding(24.dp)) }
                fleet.isEmpty() -> item { EmptyState(Icons.Outlined.DirectionsCar, "No vehicles yet. Tap Add to list the cars, bikes or tempo travellers guests can book.", Modifier.fillMaxWidth()) }
                else -> items(fleet, key = { "v${it.id}" }) { v ->
                    HcCard(Modifier.alpha(if (v.available) 1f else 0.6f)) {
                        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                            Box(Modifier.size(42.dp).clip(RoundedCornerShape(12.dp)).background(HC.GreenSoft), contentAlignment = Alignment.Center) {
                                Icon(Icons.Outlined.DirectionsCar, null, tint = HC.Green)
                            }
                            Spacer(Modifier.width(12.dp))
                            Column(Modifier.weight(1f)) {
                                Text(v.name.ifBlank { v.type } + if (v.plateNumber.isNotBlank()) " · ${v.plateNumber}" else "", fontWeight = FontWeight.SemiBold)
                                Text("${v.type} · ${v.seats} seats · ${rupees(v.pricePaise)} ${PRICE_UNIT[v.priceUnit]}", color = HC.Muted, style = MaterialTheme.typography.bodySmall)
                                val driver = listOfNotNull(v.driverName?.takeIf { it.isNotBlank() }, v.driverPhone?.takeIf { it.isNotBlank() }).joinToString(" · ")
                                if (driver.isNotBlank()) Text(driver, style = MaterialTheme.typography.bodySmall)
                            }
                            Switch(v.available, { on -> save(v.copy(available = on), v.id) }, colors = SwitchDefaults.colors(checkedTrackColor = HC.Green))
                            IconButton(onClick = { editing = v }) { Icon(Icons.Outlined.Edit, "Edit", tint = HC.Muted) }
                            IconButton(onClick = { removing = v }) { Icon(Icons.Outlined.Delete, "Remove", tint = HC.Muted) }
                        }
                    }
                }
            }
        }
    }

    if (adding || editing != null) {
        ModalBottomSheet(
            onDismissRequest = { adding = false; editing = null },
            sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), containerColor = HC.Surface,
        ) {
            VehicleForm(editing) { v, onError -> save(v, editing?.id, onDone = { adding = false; editing = null; toast("Vehicle saved") }, onError = onError) }
        }
    }
    cancelling?.let { b ->
        ConfirmDialog("Cancel this booking?", "${b.vehicle.name.ifBlank { b.vehicle.type }} for Room ${b.roomNumber}. It will be removed from their bill.", "Cancel booking", { setStatus(b, "cancelled") }, { cancelling = null })
    }
    removing?.let { v ->
        ConfirmDialog("Remove ${v.name.ifBlank { v.type }}?", "It disappears from the list. Old bookings and bills keep its details.", "Remove", {
            scope.launch {
                runCatching { Api.send("DELETE", "/api/staff/vehicles/${v.id}") }.onFailure { toast(it.message ?: "Failed") }
                loadVehicles()
            }
        }, { removing = null })
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun VehicleForm(vehicle: Vehicle?, onSave: (Vehicle, (String) -> Unit) -> Unit) {
    var type by remember { mutableStateOf(vehicle?.type ?: "Car") }
    var name by remember { mutableStateOf(vehicle?.name ?: "") }
    var plate by remember { mutableStateOf(vehicle?.plateNumber ?: "") }
    var seats by remember { mutableStateOf((vehicle?.seats ?: 4).toString()) }
    var driver by remember { mutableStateOf(vehicle?.driverName ?: "") }
    var phone by remember { mutableStateOf(vehicle?.driverPhone ?: "") }
    var price by remember { mutableStateOf(vehicle?.let { (it.pricePaise / 100.0).let { p -> if (p % 1.0 == 0.0) p.toInt().toString() else p.toString() } } ?: "") }
    var unit by remember { mutableStateOf(vehicle?.priceUnit ?: "hour") }
    var note by remember { mutableStateOf(vehicle?.note ?: "") }
    var available by remember { mutableStateOf(vehicle?.available ?: true) }
    var error by remember { mutableStateOf<String?>(null) }
    val pricePaise = price.toDoubleOrNull()?.let { Math.round(it * 100).toInt() }

    Column(Modifier.padding(horizontal = 20.dp).padding(bottom = 28.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(if (vehicle == null) "Add a vehicle" else "Edit vehicle", style = MaterialTheme.typography.titleLarge)
        Field(type, { type = it.take(40) }, "Type")
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            TYPES.forEach { t -> HcChip(t, type == t, { type = t }) }
        }
        Field(name, { name = it.take(80) }, "Model / name (optional)", placeholder = "e.g. Swift Dzire (AC)")
        Field(plate, { plate = it.uppercase().take(20) }, "Vehicle number", placeholder = "JH 01 AB 1234")
        Field(seats, { seats = it.filter(Char::isDigit).take(2) }, "Seats", keyboardType = KeyboardType.Number)
        Field(driver, { driver = it.take(80) }, "Owner / driver name")
        Field(phone, { phone = it.filter { c -> c.isDigit() || c in "+ -()" }.take(20) }, "Owner / driver phone", keyboardType = KeyboardType.Phone, supporting = "Guests see it after booking.")
        Field(price, { price = it.filter { c -> c.isDigit() || c == '.' }.take(10) }, "Price (₹, before GST)", keyboardType = KeyboardType.Decimal)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            PRICE_UNIT.forEach { (k, label) -> HcChip(label, unit == k, { unit = k }) }
        }
        Field(note, { note = it.take(200) }, "Note for guests (optional)", placeholder = "e.g. Fuel included, max 80 km per day")
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Guests can book it", Modifier.weight(1f))
            Switch(available, { available = it }, colors = SwitchDefaults.colors(checkedTrackColor = HC.Green))
        }
        ErrorText(error)
        PrimaryButton("Save vehicle", {
            error = null
            onSave(
                Vehicle(
                    id = vehicle?.id ?: 0, type = type.trim(), name = name.trim(), plateNumber = plate.trim(), seats = seats.toIntOrNull() ?: 4,
                    pricePaise = pricePaise ?: 0, priceUnit = unit, available = available, note = note.trim(), driverName = driver.trim(), driverPhone = phone.trim(),
                ),
            ) { error = it }
        }, enabled = type.isNotBlank() && pricePaise != null && (seats.toIntOrNull() ?: 0) in 1..60, modifier = Modifier.fillMaxWidth())
    }
}
