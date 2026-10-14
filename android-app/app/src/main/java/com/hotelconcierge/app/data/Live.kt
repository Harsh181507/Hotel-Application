package com.hotelconcierge.app.data

import io.socket.client.IO
import io.socket.client.Socket
import io.socket.engineio.client.transports.WebSocket
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import org.json.JSONObject
import java.net.URI

data class LiveEvent(val name: String, val data: JSONObject?)

/**
 * The live connection to the hotel server (Socket.IO). New messages, tasks,
 * orders and room changes arrive here instantly. One connection per app;
 * screens and the On-duty service all listen to [events].
 */
object Live {
    private val NAMES = listOf(
        "message:new", "messages:read", "typing", "autopilot:handled",
        "request:new", "request:updated", "request:escalated",
        "order:new", "order:updated", "order:escalated",
        "room:updated", "stay:updated", "session:ended",
        "bill:updated", "payment:submitted", "table:booked", "table:updated", "vehicle:booked", "vehicle:updated",
    )

    private var socket: Socket? = null
    private var key: String? = null

    private val _events = MutableSharedFlow<LiveEvent>(extraBufferCapacity = 256)
    val events: SharedFlow<LiveEvent> = _events

    private val _connected = MutableStateFlow(false)
    val connected: StateFlow<Boolean> = _connected

    @Synchronized
    fun connect(session: Session) {
        val newKey = "${session.server}|${session.token}"
        if (newKey == key && socket != null) return
        disconnect()
        key = newKey
        val options = IO.Options.builder()
            .setAuth(mapOf("token" to session.token))
            .setTransports(arrayOf(WebSocket.NAME))
            .setReconnection(true)
            .setReconnectionDelay(1_000)
            .setReconnectionDelayMax(10_000)
            .build()
        val s = IO.socket(URI.create(session.server.trimEnd('/')), options)
        s.on(Socket.EVENT_CONNECT) {
            _connected.value = true
            _events.tryEmit(LiveEvent("connect", null))
        }
        s.on(Socket.EVENT_DISCONNECT) { _connected.value = false }
        s.on(Socket.EVENT_CONNECT_ERROR) { args ->
            _connected.value = false
            val first = args.firstOrNull()
            val message = (first as? JSONObject)?.optString("message") ?: (first as? Exception)?.message.orEmpty()
            if (Regex("session|invalid|disabled|unauthorized", RegexOption.IGNORE_CASE).containsMatchIn(message)) {
                _events.tryEmit(LiveEvent("auth_failed", JSONObject().put("message", message)))
            }
        }
        NAMES.forEach { name ->
            s.on(name) { args -> _events.tryEmit(LiveEvent(name, args.firstOrNull() as? JSONObject)) }
        }
        s.connect()
        socket = s
    }

    @Synchronized
    fun disconnect() {
        socket?.off()
        socket?.disconnect()
        socket = null
        key = null
        _connected.value = false
    }

    fun emit(name: String, data: JSONObject = JSONObject()) {
        socket?.emit(name, data)
    }
}

/** Reads an event's data as one of the model classes (null if it doesn't fit). */
inline fun <reified T> LiveEvent.decode(): T? =
    data?.let { runCatching { Api.json.decodeFromString<T>(it.toString()) }.getOrNull() }
