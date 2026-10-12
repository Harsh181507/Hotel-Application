package com.hotelconcierge.app.ui

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Build
import androidx.compose.material.icons.outlined.CardGiftcard
import androidx.compose.material.icons.outlined.ChatBubbleOutline
import androidx.compose.material.icons.outlined.CleaningServices
import androidx.compose.material.icons.outlined.Restaurant
import androidx.compose.ui.graphics.vector.ImageVector
import com.hotelconcierge.app.ui.common.Tone
import java.text.NumberFormat
import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

// Labels and formatting shared by all screens (must match the server's names).

data class RequestKind(val type: String, val label: String, val icon: ImageVector, val hint: String)

val REQUEST_KINDS = listOf(
    RequestKind("housekeeping", "Room cleaning", Icons.Outlined.CleaningServices, "e.g. Please clean the room at 3 PM"),
    RequestKind("food", "Food order", Icons.Outlined.Restaurant, "e.g. 2 masala chai"),
    RequestKind("maintenance", "Maintenance", Icons.Outlined.Build, "e.g. The AC is not cooling"),
    RequestKind("amenities", "Extra amenities", Icons.Outlined.CardGiftcard, "e.g. 2 extra towels and a pillow"),
    RequestKind("other", "Something else", Icons.Outlined.ChatBubbleOutline, "Tell us what you need"),
)

fun requestKind(type: String) = REQUEST_KINDS.firstOrNull { it.type == type } ?: REQUEST_KINDS.last()

val REQUEST_STATUS = mapOf(
    "open" to ("New" to Tone.Amber),
    "in_progress" to ("Accepted" to Tone.Blue),
    "done" to ("Done" to Tone.Green),
    "cancelled" to ("Cancelled" to Tone.Grey),
)

val DEPARTMENTS = linkedMapOf(
    "reception" to "Front desk",
    "housekeeping" to "Housekeeping",
    "kitchen" to "Kitchen",
    "maintenance" to "Maintenance",
)

val ROLES = linkedMapOf(
    "admin" to "Admin",
    "reception" to "Front desk",
    "housekeeping" to "Housekeeping",
    "kitchen" to "Kitchen",
    "maintenance" to "Maintenance",
)

val ORDER_STEPS = listOf("placed", "preparing", "on_the_way", "delivered")
val ORDER_STATUS = mapOf(
    "placed" to ("New" to Tone.Amber),
    "preparing" to ("Preparing" to Tone.Blue),
    "on_the_way" to ("On the way" to Tone.Blue),
    "delivered" to ("Delivered" to Tone.Green),
    "cancelled" to ("Cancelled" to Tone.Grey),
)

val HK_STATUS = mapOf(
    "dirty" to ("Needs cleaning" to Tone.Red),
    "cleaning" to ("Being cleaned" to Tone.Blue),
    "inspect" to ("Waiting for check" to Tone.Amber),
    "ready" to ("Ready" to Tone.Green),
)

// ---------- Formatting ----------

private val inr = NumberFormat.getNumberInstance(Locale("en", "IN")).apply { maximumFractionDigits = 2 }

/** Prices are stored in paise (₹1 = 100). */
fun rupees(paise: Int) = "₹" + inr.format(paise / 100.0)

private fun instant(iso: String?): Instant? = iso?.let { runCatching { Instant.parse(it) }.getOrNull() }

private val clock = DateTimeFormatter.ofPattern("h:mm a", Locale.ENGLISH)
private val dayFmt = DateTimeFormatter.ofPattern("EEE d MMM", Locale.ENGLISH)

fun clockTime(iso: String?): String = instant(iso)?.atZone(ZoneId.systemDefault())?.format(clock).orEmpty()

fun dayLabel(iso: String?): String {
    val date = instant(iso)?.atZone(ZoneId.systemDefault())?.toLocalDate() ?: return ""
    val today = java.time.LocalDate.now()
    return when (date) {
        today -> "Today"
        today.minusDays(1) -> "Yesterday"
        else -> date.format(dayFmt)
    }
}

/** "just now", "5 min ago", "2 h ago", or a date. */
fun timeAgo(iso: String?): String {
    val then = instant(iso) ?: return ""
    val mins = Duration.between(then, Instant.now()).toMinutes()
    return when {
        mins < 1 -> "just now"
        mins < 60 -> "$mins min ago"
        mins < 24 * 60 -> "${mins / 60} h ago"
        else -> then.atZone(ZoneId.systemDefault()).format(dayFmt)
    }
}
