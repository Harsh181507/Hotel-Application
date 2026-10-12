package com.hotelconcierge.app

import android.app.Application
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner
import com.hotelconcierge.app.data.SessionStore
import com.hotelconcierge.app.service.Alerts

class App : Application() {
    override fun onCreate() {
        super.onCreate()
        SessionStore.init(this)
        Alerts.createChannels(this)
        // Remember whether the app is on screen (alerts: sound only vs. a notification).
        ProcessLifecycleOwner.get().lifecycle.addObserver(object : DefaultLifecycleObserver {
            override fun onStart(owner: LifecycleOwner) { Alerts.appVisible = true }
            override fun onStop(owner: LifecycleOwner) { Alerts.appVisible = false }
        })
    }
}
