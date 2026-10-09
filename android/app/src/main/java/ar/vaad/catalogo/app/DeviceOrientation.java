package ar.vaad.catalogo.app;

import android.app.Activity;
import android.content.pm.ActivityInfo;

/** Tablets may rotate; phones retain the catalog's portrait layout. */
final class DeviceOrientation {
    private DeviceOrientation() {}

    static void apply(Activity activity) {
        // Smallest width is stable across rotation. Recheck when a foldable
        // changes size, without forcing another orientation on every resize.
        boolean tablet = activity.getResources().getConfiguration().smallestScreenWidthDp >= 600;
        int orientation = tablet
                ? ActivityInfo.SCREEN_ORIENTATION_FULL_USER
                : ActivityInfo.SCREEN_ORIENTATION_PORTRAIT;
        if (activity.getRequestedOrientation() != orientation) {
            activity.setRequestedOrientation(orientation);
        }
    }
}
