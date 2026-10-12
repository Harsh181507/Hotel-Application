package com.hotelconcierge.app.data

import java.net.URI
import java.net.URLDecoder

/** What a room QR code contains: the hotel's server and the room's secret token. */
data class RoomLink(val server: String, val roomToken: String)

object QrLink {
    private val TOKEN = Regex("^[A-Za-z0-9_-]{6,64}$")

    /**
     * Room QR codes hold a link like https://hotel.example.com/guest/?room=AbC123xyz.
     * Returns null for anything else (other QR codes, broken links).
     */
    fun parse(raw: String): RoomLink? {
        val uri = runCatching { URI(raw.trim()) }.getOrNull() ?: return null
        val scheme = uri.scheme?.lowercase() ?: return null
        if (scheme != "https" && scheme != "http") return null
        val host = uri.host ?: return null
        if (!uri.rawPath.orEmpty().startsWith("/guest")) return null
        val room = uri.rawQuery.orEmpty().split('&')
            .map { it.split('=', limit = 2) }
            .firstOrNull { it.size == 2 && it[0] == "room" }
            ?.let { URLDecoder.decode(it[1], "UTF-8") }
            ?: return null
        if (!TOKEN.matches(room)) return null
        val port = if (uri.port != -1) ":${uri.port}" else ""
        return RoomLink("$scheme://$host$port", room)
    }
}
