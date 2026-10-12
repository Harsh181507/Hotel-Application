package com.hotelconcierge.app.service

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.RingtoneManager
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.hotelconcierge.app.MainActivity
import com.hotelconcierge.app.R

/** Staff alerts: a notification when the app is in the background, a sound + buzz when it's open. */
object Alerts {
    const val ALERT_CHANNEL = "staff-alerts"
    const val DUTY_CHANNEL = "on-duty"

    @Volatile var appVisible = false
    private var nextId = 100

    fun createChannels(context: Context) {
        val manager = context.getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(
            NotificationChannel(ALERT_CHANNEL, "Guest requests and orders", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "New tasks, orders and late alerts"
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 250, 120, 250)
            },
        )
        manager.createNotificationChannel(
            NotificationChannel(DUTY_CHANNEL, "On duty", NotificationManager.IMPORTANCE_LOW).apply {
                description = "Shown while you are logged in, so new work reaches you in the background"
                setShowBadge(false)
            },
        )
    }

    fun canNotify(context: Context) = Build.VERSION.SDK_INT < 33 ||
        ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    fun openAppIntent(context: Context, requestCode: Int = 0): PendingIntent = PendingIntent.getActivity(
        context, requestCode,
        Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

    fun staffAlert(context: Context, title: String, body: String) {
        if (appVisible) buzz(context) else notify(context, title, body)
    }

    private fun notify(context: Context, title: String, body: String) {
        if (!canNotify(context)) return
        val notification = NotificationCompat.Builder(context, ALERT_CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_bell)
            .setColor(0xFF3F6B56.toInt())
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setAutoCancel(true)
            .setContentIntent(openAppIntent(context, 1))
            .build()
        try {
            NotificationManagerCompat.from(context).notify(nextId++, notification)
        } catch (_: SecurityException) { /* permission removed */ }
    }

    private fun buzz(context: Context) {
        runCatching { RingtoneManager.getRingtone(context, RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION))?.play() }
        runCatching {
            val vibrator = if (Build.VERSION.SDK_INT >= 31) {
                context.getSystemService(VibratorManager::class.java).defaultVibrator
            } else {
                @Suppress("DEPRECATION") context.getSystemService(Vibrator::class.java)
            }
            vibrator.vibrate(VibrationEffect.createWaveform(longArrayOf(0, 120, 60, 120), -1))
        }
    }
}
