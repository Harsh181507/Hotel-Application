package com.hotelconcierge.app.ui.staff

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Bedtime
import androidx.compose.material.icons.outlined.PowerSettingsNew
import androidx.compose.material.icons.outlined.SmartToy
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.RadioButtonDefaults
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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.hotelconcierge.app.data.Api
import com.hotelconcierge.app.data.HotelSettings
import com.hotelconcierge.app.data.jsonOf
import com.hotelconcierge.app.ui.common.ErrorText
import com.hotelconcierge.app.ui.common.Field
import com.hotelconcierge.app.ui.common.HcCard
import com.hotelconcierge.app.ui.common.Loading
import com.hotelconcierge.app.ui.common.PrimaryButton
import com.hotelconcierge.app.ui.common.SectionLabel
import com.hotelconcierge.app.ui.theme.HC
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.outlined.AddAPhoto
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import coil3.compose.AsyncImage
import com.hotelconcierge.app.data.SessionStore
import com.hotelconcierge.app.data.UploadedImage
import com.hotelconcierge.app.ui.common.SecondaryButton
import com.hotelconcierge.app.ui.guest.imageUrl
import com.hotelconcierge.app.ui.pct
import kotlinx.coroutines.launch

private data class Mode(val key: String, val label: String, val help: String, val icon: ImageVector)

private val MODES = listOf(
    Mode("always", "Always on", "Replies to guests instantly, day and night. Goes quiet while a receptionist is chatting with that guest.", Icons.Outlined.SmartToy),
    Mode("night", "Night only", "Replies only during night hours. During the day your team answers.", Icons.Outlined.Bedtime),
    Mode("off", "Off", "Only people reply.", Icons.Outlined.PowerSettingsNew),
)

private val TIME = Regex("^([01]\\d|2[0-3]):[0-5]\\d$")

/** Admin: hotel name, autopilot, late alerts, payments (UPI QR, GST), restaurant hours, housekeeping. */
@Composable
fun SettingsScreen(onBack: () -> Unit) {
    val scope = rememberCoroutineScope()
    val toast = rememberToast()
    val context = LocalContext.current
    val server = SessionStore.session.value?.server.orEmpty()
    var loaded by remember { mutableStateOf<HotelSettings?>(null) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        runCatching { Api.get<HotelSettings>("/api/staff/settings") }.onSuccess { loaded = it }.onFailure { error = it.message }
    }

    Column(Modifier.fillMaxSize()) {
        StaffHeader("Settings", onBack = onBack)
        val s = loaded ?: return@Column if (error != null) Column(Modifier.padding(16.dp)) { ErrorText(error) } else Loading()

        var name by remember { mutableStateOf(s.name) }
        var mode by remember { mutableStateOf(s.autopilotMode) }
        var nightStart by remember { mutableStateOf(s.nightStart) }
        var nightEnd by remember { mutableStateOf(s.nightEnd) }
        var timezone by remember { mutableStateOf(s.timezone) }
        var escalate by remember { mutableStateOf(s.escalateAfterMinutes.toString()) }
        var inspection by remember { mutableStateOf(s.requireInspection) }
        var qrId by remember { mutableStateOf(s.paymentQrImageId) }
        var upiId by remember { mutableStateOf(s.upiId) }
        var payee by remember { mutableStateOf(s.payeeName) }
        var gstin by remember { mutableStateOf(s.gstin) }
        var taxFood by remember { mutableStateOf(pct(s.taxFoodPct)) }
        var taxVehicle by remember { mutableStateOf(pct(s.taxVehiclePct)) }
        var taxOther by remember { mutableStateOf(pct(s.taxOtherPct)) }
        var restOpen by remember { mutableStateOf(s.restaurantOpen) }
        var restClose by remember { mutableStateOf(s.restaurantClose) }
        var holdMinutes by remember { mutableStateOf(s.tableBookingMinutes.toString()) }
        var uploading by remember { mutableStateOf(false) }
        var saving by remember { mutableStateOf(false) }
        val pickQr = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
            if (uri == null) return@rememberLauncherForActivityResult
            scope.launch {
                uploading = true
                runCatching { Api.post<UploadedImage>("/api/staff/dining/images", jsonOf("dataUrl" to photoDataUrl(context, uri))) }
                    .onSuccess { qrId = it.id; toast("QR picture added. Tap Save settings to use it.") }
                    .onFailure { toast(it.message ?: "Upload failed") }
                uploading = false
            }
        }

        val minutes = escalate.toIntOrNull()
        val taxes = listOf(taxFood, taxVehicle, taxOther).map { it.ifBlank { "0" }.toDoubleOrNull() }
        val hold = holdMinutes.toIntOrNull()
        val valid = name.isNotBlank() && TIME.matches(nightStart) && TIME.matches(nightEnd) && timezone.isNotBlank() && minutes != null && minutes in 1..240 &&
            taxes.all { it != null && it in 0.0..50.0 } && TIME.matches(restOpen) && TIME.matches(restClose) && hold != null && hold in 30..300

        Column(Modifier.verticalScroll(rememberScrollState()).padding(horizontal = 16.dp).padding(bottom = 32.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            HcCard {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    SectionLabel("Hotel")
                    Field(name, { name = it.take(100) }, "Hotel name (shown to guests)")
                }
            }
            HcCard {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    SectionLabel("Autopilot (automatic replies)")
                    Text(
                        "Answers guests from your Answers list and sends requests (towels, cleaning, repairs) straight to the right team. Free, no AI service.",
                        color = HC.Muted, style = MaterialTheme.typography.bodySmall,
                    )
                    MODES.forEach { m ->
                        Surface(
                            onClick = { mode = m.key },
                            shape = RoundedCornerShape(14.dp),
                            color = if (mode == m.key) HC.GreenSoft else HC.Surface,
                            border = BorderStroke(1.dp, if (mode == m.key) HC.Green else HC.Border),
                        ) {
                            Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                                RadioButton(mode == m.key, { mode = m.key }, colors = RadioButtonDefaults.colors(selectedColor = HC.Green))
                                Icon(m.icon, null, tint = HC.GreenDark)
                                Spacer(Modifier.width(10.dp))
                                Column {
                                    Text(m.label, style = MaterialTheme.typography.titleSmall)
                                    Text(m.help, color = HC.Muted, style = MaterialTheme.typography.bodySmall)
                                }
                            }
                        }
                    }
                    if (mode == "night") {
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            Field(nightStart, { nightStart = it.take(5) }, "Night starts", placeholder = "22:00", modifier = Modifier.weight(1f), supporting = "HH:MM")
                            Field(nightEnd, { nightEnd = it.take(5) }, "Night ends", placeholder = "07:00", modifier = Modifier.weight(1f), supporting = "HH:MM")
                        }
                        Field(timezone, { timezone = it.take(60) }, "Time zone", supporting = "Used for night hours. India: Asia/Kolkata")
                    }
                }
            }
            HcCard {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    SectionLabel("Late alerts")
                    Field(
                        escalate, { escalate = it.filter(Char::isDigit).take(3) },
                        "Alert the front desk after (minutes)", keyboardType = KeyboardType.Number,
                        supporting = "When a request or order waits longer than this (1-240)",
                    )
                }
            }
            HcCard {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    SectionLabel("Payments")
                    Text(
                        "Guests see your UPI QR on their bill, pay with any UPI app and send you the UPI reference (UTR). You confirm it in Bills. Money goes straight to your account; no fees.",
                        color = HC.Muted, style = MaterialTheme.typography.bodySmall,
                    )
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        val id = qrId
                        if (id != null) {
                            AsyncImage(
                                imageUrl(server, id), "Your UPI QR code",
                                Modifier.size(96.dp).clip(RoundedCornerShape(12.dp)).background(androidx.compose.ui.graphics.Color.White), contentScale = ContentScale.Fit,
                            )
                        } else {
                            Icon(Icons.Outlined.AddAPhoto, null, Modifier.size(48.dp), tint = HC.Muted)
                        }
                        Spacer(Modifier.width(14.dp))
                        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            SecondaryButton(
                                if (uploading) "Uploading…" else if (id == null) "Upload UPI QR" else "Change QR",
                                { pickQr.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
                                icon = Icons.Outlined.AddAPhoto, enabled = !uploading,
                            )
                            if (id != null) SecondaryButton("Remove", { qrId = null }, icon = Icons.Outlined.Delete)
                        }
                    }
                    Field(upiId, { upiId = it.trim().take(100) }, "UPI ID (optional)", placeholder = "hotelname@okaxis", supporting = "Lets guests open their UPI app with the amount filled in.")
                    Field(payee, { payee = it.take(100) }, "Name on the account", placeholder = name)
                    Field(gstin, { gstin = it.uppercase().filter(Char::isLetterOrDigit).take(15) }, "GSTIN (printed on bills, optional)")
                    Text("GST added to the bill (%)", style = MaterialTheme.typography.labelMedium, color = HC.Muted)
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Field(taxFood, { taxFood = it.filter { c -> c.isDigit() || c == '.' }.take(5) }, "Food", keyboardType = KeyboardType.Decimal, modifier = Modifier.weight(1f))
                        Field(taxVehicle, { taxVehicle = it.filter { c -> c.isDigit() || c == '.' }.take(5) }, "Vehicles", keyboardType = KeyboardType.Decimal, modifier = Modifier.weight(1f))
                        Field(taxOther, { taxOther = it.filter { c -> c.isDigit() || c == '.' }.take(5) }, "Other", keyboardType = KeyboardType.Decimal, modifier = Modifier.weight(1f))
                    }
                    Text("Food = room service + restaurant. Use 0 if your prices already include GST. New rates apply to new bill items only.", color = HC.Muted, style = MaterialTheme.typography.bodySmall)
                }
            }
            HcCard {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    SectionLabel("Restaurant table booking")
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Field(restOpen, { restOpen = it.take(5) }, "Opens", placeholder = "12:00", modifier = Modifier.weight(1f), supporting = "HH:MM")
                        Field(restClose, { restClose = it.take(5) }, "Closes", placeholder = "23:00", modifier = Modifier.weight(1f), supporting = "HH:MM")
                    }
                    Field(
                        holdMinutes, { holdMinutes = it.filter(Char::isDigit).take(3) }, "A booking holds the table for (minutes)",
                        keyboardType = KeyboardType.Number, supporting = "30-300. Add your tables in More → Table bookings.",
                    )
                }
            }
            HcCard {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    SectionLabel("Housekeeping")
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text("Check rooms before they're ready")
                            Text("A cleaned room waits for the front desk to approve it", color = HC.Muted, style = MaterialTheme.typography.bodySmall)
                        }
                        Switch(inspection, { inspection = it }, colors = SwitchDefaults.colors(checkedTrackColor = HC.Green))
                    }
                }
            }
            ErrorText(error)
            PrimaryButton("Save settings", {
                scope.launch {
                    saving = true; error = null
                    runCatching {
                        Api.put<HotelSettings>(
                            "/api/staff/settings",
                            jsonOf(
                                "name" to name.trim(), "autopilot_mode" to mode, "night_start" to nightStart, "night_end" to nightEnd,
                                "timezone" to timezone.trim(), "escalate_after_minutes" to minutes, "require_inspection" to inspection,
                                "payment_qr_image_id" to qrId, "upi_id" to upiId, "payee_name" to payee.trim(), "gstin" to gstin,
                                "tax_food_pct" to taxes[0], "tax_vehicle_pct" to taxes[1], "tax_other_pct" to taxes[2],
                                "restaurant_open" to restOpen, "restaurant_close" to restClose, "table_booking_minutes" to hold,
                            ),
                        )
                    }.onSuccess { loaded = it; toast("Settings saved") }.onFailure { error = it.message }
                    saving = false
                }
            }, enabled = valid, loading = saving, modifier = Modifier.fillMaxWidth())
        }
    }
}
