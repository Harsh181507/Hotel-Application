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
import kotlinx.coroutines.launch

private data class Mode(val key: String, val label: String, val help: String, val icon: ImageVector)

private val MODES = listOf(
    Mode("always", "Always on", "Replies to guests instantly, day and night. Goes quiet while a receptionist is chatting with that guest.", Icons.Outlined.SmartToy),
    Mode("night", "Night only", "Replies only during night hours. During the day your team answers.", Icons.Outlined.Bedtime),
    Mode("off", "Off", "Only people reply.", Icons.Outlined.PowerSettingsNew),
)

private val TIME = Regex("^([01]\\d|2[0-3]):[0-5]\\d$")

/** Admin: hotel name, autopilot, late alerts and housekeeping inspection. */
@Composable
fun SettingsScreen(onBack: () -> Unit) {
    val scope = rememberCoroutineScope()
    val toast = rememberToast()
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
        var saving by remember { mutableStateOf(false) }

        val minutes = escalate.toIntOrNull()
        val valid = name.isNotBlank() && TIME.matches(nightStart) && TIME.matches(nightEnd) && timezone.isNotBlank() && minutes != null && minutes in 1..240

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
                            ),
                        )
                    }.onSuccess { loaded = it; toast("Settings saved") }.onFailure { error = it.message }
                    saving = false
                }
            }, enabled = valid, loading = saving, modifier = Modifier.fillMaxWidth())
        }
    }
}
