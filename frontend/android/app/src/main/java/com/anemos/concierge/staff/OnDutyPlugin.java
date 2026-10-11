package com.anemos.concierge.staff;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

/**
 * Staff alerts for the Android app:
 *   start / stop  - "On duty" mode (see OnDutyService): keeps the app running in the background
 *   alert         - shows a notification right away (sound + vibration), e.g. "Room 106: 2 towels"
 *   requestPermissions (built in) - asks for notification permission (Android 13+)
 */
@CapacitorPlugin(
    name = "OnDuty",
    permissions = { @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS }) }
)
public class OnDutyPlugin extends Plugin {

    static final String ALERT_CHANNEL = "staff-alerts";
    private int nextId = 1;

    @PluginMethod
    public void start(PluginCall call) {
        Context context = getContext();
        Intent intent = new Intent(context, OnDutyService.class);
        intent.putExtra("text", call.getString("text", "You'll be alerted about new tasks and orders"));
        ContextCompat.startForegroundService(context, intent);
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        getContext().stopService(new Intent(getContext(), OnDutyService.class));
        call.resolve();
    }

    @PluginMethod
    public void alert(PluginCall call) {
        Context context = getContext();
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager.getNotificationChannel(ALERT_CHANNEL) == null) {
            NotificationChannel channel = new NotificationChannel(ALERT_CHANNEL, "Guest requests and orders", NotificationManager.IMPORTANCE_HIGH);
            channel.setDescription("New tasks, orders and late alerts");
            channel.enableVibration(true);
            channel.setVibrationPattern(new long[] { 0, 250, 120, 250 });
            manager.createNotificationChannel(channel);
        }

        Intent open = new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent openApp = PendingIntent.getActivity(context, 1, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, ALERT_CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_duty)
            .setColor(0xFF3F6B56)
            .setContentTitle(call.getString("title", "Anemos"))
            .setContentText(call.getString("body", ""))
            .setStyle(new NotificationCompat.BigTextStyle().bigText(call.getString("body", "")))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setAutoCancel(true)
            .setContentIntent(openApp);

        try {
            NotificationManagerCompat.from(context).notify(nextId++, builder.build());
            call.resolve();
        } catch (SecurityException e) {
            call.reject("Notifications are not allowed");
        }
    }
}
