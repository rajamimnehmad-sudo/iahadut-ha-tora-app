package ar.vaad.catalogo.app;

import static org.junit.Assert.assertEquals;
import android.app.Activity;
import android.content.pm.ActivityInfo;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 35)
public class DeviceOrientationTest {
    @Test @Config(qualifiers = "sw600dp-w600dp-h960dp-port")
    public void tabletCanRotateAndStaysUnlockedInLandscape() {
        Activity activity = Robolectric.buildActivity(Activity.class).setup().get();
        DeviceOrientation.apply(activity);
        assertEquals(ActivityInfo.SCREEN_ORIENTATION_FULL_USER, activity.getRequestedOrientation());
        RuntimeEnvironment.setQualifiers("sw600dp-w960dp-h600dp-land");
        DeviceOrientation.apply(activity);
        assertEquals(ActivityInfo.SCREEN_ORIENTATION_FULL_USER, activity.getRequestedOrientation());
    }

    @Test @Config(qualifiers = "sw360dp-w800dp-h360dp-land")
    public void landscapePhoneStillUsesPortrait() {
        Activity activity = Robolectric.buildActivity(Activity.class).setup().get();
        DeviceOrientation.apply(activity);
        assertEquals(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT, activity.getRequestedOrientation());
    }

    @Test @Config(qualifiers = "sw599dp-w599dp-h900dp-port")
    public void unfoldedLargeScreenUnlocksAndFoldedPhoneLocksAgain() {
        Activity activity = Robolectric.buildActivity(Activity.class).setup().get();
        DeviceOrientation.apply(activity);
        assertEquals(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT, activity.getRequestedOrientation());
        RuntimeEnvironment.setQualifiers("sw720dp-w720dp-h1000dp-port");
        DeviceOrientation.apply(activity);
        assertEquals(ActivityInfo.SCREEN_ORIENTATION_FULL_USER, activity.getRequestedOrientation());
        RuntimeEnvironment.setQualifiers("sw360dp-w360dp-h800dp-port");
        DeviceOrientation.apply(activity);
        assertEquals(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT, activity.getRequestedOrientation());
    }
}
