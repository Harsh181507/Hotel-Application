package com.hotelconcierge.app.ui.staff

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Login
import androidx.compose.material.icons.outlined.Dns
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.hotelconcierge.app.data.Api
import com.hotelconcierge.app.data.Session
import com.hotelconcierge.app.data.SessionStore
import com.hotelconcierge.app.data.StaffLoginResponse
import com.hotelconcierge.app.data.jsonOf
import com.hotelconcierge.app.ui.common.ErrorText
import com.hotelconcierge.app.ui.common.Field
import com.hotelconcierge.app.ui.common.HcCard
import com.hotelconcierge.app.ui.common.InfoText
import com.hotelconcierge.app.ui.common.PrimaryButton
import com.hotelconcierge.app.ui.theme.HC
import kotlinx.coroutines.launch
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

@Composable
fun StaffLoginScreen(onBack: () -> Unit) {
    val scope = rememberCoroutineScope()
    var server by remember { mutableStateOf(SessionStore.staffServer) }
    var login by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    var changing by remember { mutableStateOf(false) }

    fun submit() = scope.launch {
        busy = true
        error = null
        runCatching {
            Api.json.decodeFromString<StaffLoginResponse>(
                Api.call("POST", "/api/auth/staff/login", jsonOf("email" to login.trim(), "password" to password), server = server, auth = false),
            )
        }.onSuccess { res ->
            SessionStore.save(Session.Staff(server, res.token, res.staff.id, res.staff.name, login.trim().lowercase(), res.staff.role))
        }.onFailure { error = it.message; busy = false }
    }

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp), verticalArrangement = Arrangement.Center) {
        HcCard {
            Column(Modifier.padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Text("Hotel Concierge", style = MaterialTheme.typography.displaySmall, textAlign = TextAlign.Center)
                Text("STAFF LOGIN", style = MaterialTheme.typography.labelMedium, color = HC.Muted)
                Spacer(Modifier.height(20.dp))
                SessionStore.notice?.let { InfoText(it); Spacer(Modifier.height(12.dp)) }
                Field(login, { login = it }, "Email or username", keyboardType = KeyboardType.Email)
                Spacer(Modifier.height(12.dp))
                Field(password, { password = it }, "Password", password = true, keyboardType = KeyboardType.Password,
                    onDone = { if (login.isNotBlank() && password.isNotBlank() && !busy) submit() })
                Spacer(Modifier.height(12.dp))
                ErrorText(error)
                Spacer(Modifier.height(12.dp))
                PrimaryButton(
                    "Log in", onClick = { submit() }, loading = busy, icon = Icons.AutoMirrored.Outlined.Login,
                    enabled = login.isNotBlank() && password.isNotBlank(), modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(14.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Outlined.Dns, null, Modifier.size(16.dp), tint = HC.Muted)
                    Text("  ${Api.host(server)}", color = HC.Muted, style = MaterialTheme.typography.bodySmall)
                    TextButton(onClick = { changing = true }) { Text("Change", color = HC.Maroon) }
                }
                TextButton(onClick = onBack) { Text("I'm a guest", color = HC.Muted) }
            }
        }
    }

    if (changing) {
        var text by remember { mutableStateOf(Api.host(server)) }
        var checking by remember { mutableStateOf(false) }
        var problem by remember { mutableStateOf<String?>(null) }
        AlertDialog(
            onDismissRequest = { changing = false },
            title = { Text("Hotel server") },
            text = {
                Column {
                    Text("Ask your manager for the address, e.g. hotel-name.onrender.com", color = HC.Muted)
                    Spacer(Modifier.height(12.dp))
                    Field(text, { text = it; problem = null }, "Server address", keyboardType = KeyboardType.Uri, supporting = problem)
                }
            },
            confirmButton = {
                TextButton(enabled = !checking, onClick = {
                    scope.launch {
                        checking = true
                        var url = text.trim().trimEnd('/')
                        if (!url.startsWith("http://") && !url.startsWith("https://")) url = "https://$url"
                        val ok = runCatching {
                            Api.json.parseToJsonElement(Api.call("GET", "/health", server = url, auth = false)).jsonObject["ok"]?.jsonPrimitive?.content == "true"
                        }.getOrDefault(false)
                        checking = false
                        if (ok) { server = url; SessionStore.staffServer = url; changing = false } else problem = "No hotel server found at ${Api.host(url)}"
                    }
                }) { Text(if (checking) "Checking…" else "Save") }
            },
            dismissButton = { TextButton(onClick = { changing = false }) { Text("Cancel") } },
            containerColor = HC.Surface,
        )
    }
}
