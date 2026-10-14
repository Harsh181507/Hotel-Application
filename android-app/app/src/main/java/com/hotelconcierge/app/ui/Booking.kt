package com.hotelconcierge.app.ui

import android.net.Uri
import com.hotelconcierge.app.data.PaymentInfo
import com.hotelconcierge.app.data.Vehicle
import com.hotelconcierge.app.ui.common.Tone
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.ceil

// Dates and times for bookings. They are always in the hotel's time zone: the server sends
// hotel-local text like "2026-10-14" and "2026-10-14 19:30", so the phone's time zone never matters.
// Same rules as the website (frontend/src/lib/booking.js).

private val localFmt = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm")
private val dayLongFmt = DateTimeFormatter.ofPattern("EEE, d MMM", Locale.ENGLISH)
private val dayShortFmt = DateTimeFormatter.ofPattern("EEE d", Locale.ENGLISH)

fun addDays(date: String, n: Long): String = LocalDate.parse(date).plusDays(n).toString()

/** "Today", "Tomorrow", "Thu 16" */
fun dayChip(date: String, today: String): String = when (date) {
    today -> "Today"
    addDays(today, 1) -> "Tomorrow"
    else -> LocalDate.parse(date).format(dayShortFmt)
}

/** "Thu, 16 Oct" */
fun dayLong(date: String): String = LocalDate.parse(date).format(dayLongFmt)

/** "19:30" -> "7:30 pm" */
fun time12(hhmm: String): String {
    val (h, m) = hhmm.split(":").map { it.toInt() }
    return "${(h + 11) % 12 + 1}:${m.toString().padStart(2, '0')} ${if (h < 12) "am" else "pm"}"
}

/** Minutes since 1970 for a hotel-local "YYYY-MM-DD HH:MM" (only for comparing). */
fun localMinutes(local: String): Long = LocalDateTime.parse(local, localFmt).toEpochSecond(java.time.ZoneOffset.UTC) / 60

fun addMinutesLocal(local: String, minutes: Long): String = LocalDateTime.parse(local, localFmt).plusMinutes(minutes).format(localFmt)

/** "7:30 pm" if on `date`, else "Thu, 16 Oct 7:30 pm". */
fun localLabel(local: String, date: String? = null): String {
    val d = local.take(10)
    val t = local.substring(11, 16)
    return if (d == date) time12(t) else "${dayLong(d)} ${time12(t)}"
}

/** "10:00 am – 1:00 pm" (with dates when the range crosses days or isn't on `date`). */
fun rangeLabel(startLocal: String, endLocal: String, date: String? = null): String {
    val sameDay = startLocal.take(10) == endLocal.take(10)
    return "${localLabel(startLocal, date)} – ${if (sameDay) localLabel(endLocal, startLocal.take(10)) else localLabel(endLocal)}"
}

/** Every half hour of the day: "00:00", "00:30" ... "23:30" */
val HALF_HOURS: List<String> = (0 until 48).map { "%02d:%s".format(it / 2, if (it % 2 == 1) "30" else "00") }

val VEHICLE_DURATIONS = listOf(
    1 to "1 hour", 2 to "2 hours", 3 to "3 hours", 4 to "4 hours", 6 to "6 hours", 8 to "8 hours", 12 to "12 hours",
    24 to "1 day", 48 to "2 days", 72 to "3 days",
)

val PRICE_UNIT = mapOf("hour" to "per hour", "day" to "per day", "trip" to "per trip")

/** Same rule as the server: hourly, per started day, or one price per trip. */
fun vehiclePrice(v: Vehicle, hours: Int): Int = when (v.priceUnit) {
    "hour" -> v.pricePaise * hours
    "day" -> v.pricePaise * ceil(hours / 24.0).toInt()
    else -> v.pricePaise
}

val TABLE_STATUS = mapOf(
    "confirmed" to ("Confirmed" to Tone.Green),
    "seated" to ("Seated" to Tone.Blue),
    "completed" to ("Completed" to Tone.Grey),
    "cancelled" to ("Cancelled" to Tone.Grey),
    "no_show" to ("No-show" to Tone.Red),
)

val VEHICLE_STATUS = mapOf(
    "confirmed" to ("Confirmed" to Tone.Green),
    "completed" to ("Completed" to Tone.Grey),
    "cancelled" to ("Cancelled" to Tone.Grey),
)

val PAY_STATUS = mapOf(
    "paid" to ("Paid" to Tone.Green),
    "pending" to ("Checking" to Tone.Amber),
    "unpaid" to ("Unpaid" to Tone.Red),
)

val CHARGE_KIND = mapOf(
    "room_service" to "Room service",
    "restaurant" to "Restaurant",
    "vehicle" to "Vehicle",
    "extra" to "Extra",
    "discount" to "Discount",
)

val PAYMENT_METHOD = mapOf("upi" to "UPI", "cash" to "Cash", "card" to "Card", "advance" to "Advance", "other" to "Other")

/** upi://pay link: opens the guest's UPI app with the amount filled in. */
fun upiUri(payment: PaymentInfo, amountPaise: Int, note: String): Uri = Uri.Builder()
    .scheme("upi").authority("pay")
    .appendQueryParameter("pa", payment.upiId)
    .appendQueryParameter("pn", payment.payeeName)
    .appendQueryParameter("am", "%.2f".format(Locale.US, amountPaise / 100.0))
    .appendQueryParameter("cu", "INR")
    .appendQueryParameter("tn", note)
    .build()

/** "2.5" -> "2.5", "5.0" -> "5" (for GST rates) */
fun pct(value: Double): String = if (value % 1.0 == 0.0) value.toInt().toString() else value.toString()
