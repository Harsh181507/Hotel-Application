package com.anemos.concierge.staff;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(OnDutyPlugin.class);
        super.onCreate(savedInstanceState);
    }

    // App fully closed: switch off "On duty" mode.
    @Override
    public void onDestroy() {
        stopService(new Intent(this, OnDutyService.class));
        super.onDestroy();
    }
}
