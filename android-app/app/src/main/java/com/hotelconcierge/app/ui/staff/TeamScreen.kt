package com.hotelconcierge.app.ui.staff

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.PersonAdd
import androidx.compose.material3.ExperimentalMaterial3Api
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.hotelconcierge.app.data.Api
import com.hotelconcierge.app.data.Session
import com.hotelconcierge.app.data.StaffUser
import com.hotelconcierge.app.data.jsonOf
import com.hotelconcierge.app.ui.ROLES
import com.hotelconcierge.app.ui.common.ErrorText
import com.hotelconcierge.app.ui.common.Field
import com.hotelconcierge.app.ui.common.HcCard
import com.hotelconcierge.app.ui.common.HcChip
import com.hotelconcierge.app.ui.common.Loading
import com.hotelconcierge.app.ui.common.PrimaryButton
import com.hotelconcierge.app.ui.common.SecondaryButton
import com.hotelconcierge.app.ui.common.StatusPill
import com.hotelconcierge.app.ui.common.Tone
import com.hotelconcierge.app.ui.theme.HC
import kotlinx.coroutines.launch

/** Admin: staff logins, roles and housekeeping floors. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TeamScreen(session: Session.Staff, onBack: () -> Unit) {
    val scope = rememberCoroutineScope()
    var users by remember { mutableStateOf<List<StaffUser>?>(null) }
    var editing by remember { mutableStateOf<StaffUser?>(null) }
    var adding by remember { mutableStateOf(false) }

    suspend fun load() { users = runCatching { Api.get<List<StaffUser>>("/api/staff/users") }.getOrDefault(users ?: emptyList()) }
    LaunchedEffect(Unit) { load() }

    Column(Modifier.fillMaxSize()) {
        val list = users
        StaffHeader("Team", list?.let { "${it.count { u -> u.active }} active staff" }, onBack = onBack) {
            SecondaryButton("Add", { adding = true }, icon = Icons.Outlined.PersonAdd)
        }
        if (list == null) return@Column Loading()
        LazyColumn(contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(list, key = { it.id }) { u ->
                HcCard(Modifier.clip(RoundedCornerShape(18.dp)).clickable { editing = u }) {
                    Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            Modifier.size(42.dp).clip(CircleShape).background(if (u.active) HC.Green else HC.Surface2),
                            contentAlignment = Alignment.Center,
                        ) { Text(u.name.take(1).uppercase(), color = if (u.active) Color.White else HC.Muted, fontWeight = FontWeight.Bold) }
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) {
                            Text(u.name + if (u.id == session.id) " (you)" else "", style = MaterialTheme.typography.titleSmall)
                            Text(
                                u.login + if (u.role == "housekeeping" && u.floors.isNotBlank()) " · floors ${u.floors}" else "",
                                color = HC.Muted, style = MaterialTheme.typography.bodySmall,
                            )
                        }
                        if (!u.active) StatusPill("Disabled", Tone.Red)
                        else StatusPill(ROLES[u.role] ?: u.role, if (u.role == "admin") Tone.Amber else Tone.Green)
                    }
                }
            }
        }
    }

    if (adding || editing != null) {
        ModalBottomSheet(
            onDismissRequest = { adding = false; editing = null },
            sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
            containerColor = HC.Surface,
        ) {
            UserForm(editing, isSelf = editing?.id == session.id, onSaved = { adding = false; editing = null; scope.launch { load() } })
        }
    }
}

@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
private fun UserForm(user: StaffUser?, isSelf: Boolean, onSaved: () -> Unit) {
    val scope = rememberCoroutineScope()
    var name by remember { mutableStateOf(user?.name ?: "") }
    var login by remember { mutableStateOf(user?.login ?: "") }
    var password by remember { mutableStateOf("") }
    var role by remember { mutableStateOf(user?.role ?: "reception") }
    var floors by remember { mutableStateOf(user?.floors ?: "") }
    var active by remember { mutableStateOf(user?.active ?: true) }
    var saving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    val passwordOk = if (user == null) password.length >= 8 else password.isEmpty() || password.length >= 8
    val valid = name.isNotBlank() && login.length >= 3 && passwordOk

    Column(Modifier.padding(horizontal = 20.dp).padding(bottom = 28.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(if (user == null) "Add a staff member" else "Edit ${user.name}", style = MaterialTheme.typography.titleLarge)
        Field(name, { name = it.take(100) }, "Name")
        Field(
            login, { login = it.lowercase().filter { c -> c.isLetterOrDigit() || c in "._@+-" }.take(100) }, "Login ID",
            placeholder = "e.g. priya or priya@hotel.com", enabled = user == null,
            supporting = if (user == null) "They type this to log in" else "Login IDs can't be changed",
        )
        Field(
            password, { password = it.take(200) }, if (user == null) "Password" else "New password (optional)", password = true,
            supporting = if (user == null) "At least 8 characters" else "Leave empty to keep the current one",
        )
        Text("Job", style = MaterialTheme.typography.labelMedium, color = HC.Muted)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            ROLES.forEach { (key, label) -> HcChip(label, role == key, { if (!isSelf) role = key }) }
        }
        if (isSelf) Text("You can't change your own job.", color = HC.Muted, style = MaterialTheme.typography.bodySmall)
        if (role == "housekeeping") {
            Field(floors, { v -> floors = v.filter { it.isLetterOrDigit() || it == ',' }.take(100) }, "Floors they clean", placeholder = "e.g. 1,2", supporting = "Rooms on these floors are given to them automatically")
        }
        if (user != null && !isSelf) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("Can log in")
                    Text("Turn off when someone leaves the hotel", color = HC.Muted, style = MaterialTheme.typography.bodySmall)
                }
                Switch(active, { active = it }, colors = SwitchDefaults.colors(checkedTrackColor = HC.Green))
            }
        }
        ErrorText(error)
        PrimaryButton(if (user == null) "Add staff member" else "Save changes", {
            scope.launch {
                saving = true; error = null
                runCatching {
                    if (user == null) {
                        Api.post<StaffUser>("/api/staff/users", jsonOf("name" to name.trim(), "login" to login, "password" to password, "role" to role, "floors" to floors))
                    } else {
                        val fields = buildList<Pair<String, Any?>> {
                            add("name" to name.trim())
                            add("floors" to floors)
                            if (!isSelf) { add("role" to role); add("active" to active) }
                            if (password.isNotEmpty()) add("password" to password)
                        }
                        Api.patch<StaffUser>("/api/staff/users/${user.id}", jsonOf(*fields.toTypedArray()))
                    }
                }.onSuccess { onSaved() }.onFailure { error = it.message; saving = false }
            }
        }, enabled = valid, loading = saving, modifier = Modifier.fillMaxWidth())
    }
}
