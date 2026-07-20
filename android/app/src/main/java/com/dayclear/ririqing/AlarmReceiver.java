package com.dayclear.ririqing;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class AlarmReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String title = intent.getStringExtra("task_title");
        ReminderService.play(context, title == null ? "今天的任务到时间了" : title);
        ReminderScheduler.restore(context);
    }
}
