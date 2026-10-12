package com.hotelconcierge.app.data

import android.content.Context
import android.content.SharedPreferences
import com.hotelconcierge.app.BuildConfig
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/** Who is logged in on this phone. Kept in the app's private storage. */
sealed interface Session {
    val server: String
    val token: String

    data class Guest(
        override val server: String,
        override val token: String,
        val roomToken: String,
        val name: String,
        val roomNumber: String,
        val hotelName: String,
    ) : Session

    data class Staff(
        override val server: String,
        override val token: String,
        val id: Int,
        val name: String,
        val login: String,
        val role: String,
    ) : Session {
        val isDesk get() = role == "admin" || role == "reception"
        val isAdmin get() = role == "admin"
    }
}

object SessionStore {
    private lateinit var prefs: SharedPreferences
    private val _session = MutableStateFlow<Session?>(null)
    val session: StateFlow<Session?> = _session

    /** A message for the next login screen, e.g. "You have been checked out". */
    var notice: String? = null

    fun init(context: Context) {
        prefs = context.getSharedPreferences("session", Context.MODE_PRIVATE)
        _session.value = read()
    }

    /** Server the staff login screen uses (changeable there). */
    var staffServer: String
        get() = prefs.getString("staffServer", null) ?: BuildConfig.DEFAULT_SERVER
        set(value) = prefs.edit().putString("staffServer", value).apply()

    fun save(session: Session) {
        val e = prefs.edit().clear().putString("staffServer", staffServer)
        when (session) {
            is Session.Guest -> e.putString("mode", "guest")
                .putString("roomToken", session.roomToken).putString("name", session.name)
                .putString("roomNumber", session.roomNumber).putString("hotelName", session.hotelName)
            is Session.Staff -> e.putString("mode", "staff")
                .putInt("id", session.id).putString("name", session.name)
                .putString("login", session.login).putString("role", session.role)
        }
        e.putString("server", session.server).putString("token", session.token).apply()
        notice = null
        _session.value = session
    }

    fun clear(message: String? = null) {
        val server = staffServer
        prefs.edit().clear().putString("staffServer", server).apply()
        notice = message
        _session.value = null
    }

    private fun read(): Session? {
        val server = prefs.getString("server", null) ?: return null
        val token = prefs.getString("token", null) ?: return null
        return when (prefs.getString("mode", null)) {
            "guest" -> Session.Guest(
                server, token,
                roomToken = prefs.getString("roomToken", "")!!,
                name = prefs.getString("name", "")!!,
                roomNumber = prefs.getString("roomNumber", "")!!,
                hotelName = prefs.getString("hotelName", "")!!,
            )
            "staff" -> Session.Staff(
                server, token,
                id = prefs.getInt("id", 0),
                name = prefs.getString("name", "")!!,
                login = prefs.getString("login", "")!!,
                role = prefs.getString("role", "reception")!!,
            )
            else -> null
        }
    }
}
