package app.eos.family;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.os.Build;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

/**
 * Casca Android do EOS (D-228).
 *
 * A atividade não desenha nada: a interface é o app web carregado pelo
 * WebView. O que existe aqui é o que o WebView não consegue fazer sozinho.
 */
public class MainActivity extends BridgeActivity {

    /** Precisa ser idêntico a `default_notification_channel_id` em strings.xml. */
    private static final String CANAL_ALERTAS = "eos_alerts";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        criarCanalDeAlertas();
    }

    /**
     * O canal precisa existir ANTES da primeira notificação.
     *
     * Se o FCM entregar apontando para um canal inexistente, o Android 8+
     * descarta a mensagem em silêncio — o servidor relata sucesso e o telefone
     * nunca toca. É exatamente o modo de falha que a D-119 escreveu `sendPush`
     * para tornar impossível, e do lado do aparelho ele voltaria por esta porta.
     *
     * `IMPORTANCE_HIGH` é o que põe o alerta na tela de bloqueio com som. Para
     * um app cuja função é avisar de perigo, importância menor seria desligar o
     * produto no lugar mais discreto possível.
     */
    private void criarCanalDeAlertas() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

        NotificationManager gerente = getSystemService(NotificationManager.class);
        if (gerente == null) return;
        if (gerente.getNotificationChannel(CANAL_ALERTAS) != null) return;

        NotificationChannel canal = new NotificationChannel(
                CANAL_ALERTAS,
                getString(R.string.default_notification_channel_name),
                NotificationManager.IMPORTANCE_HIGH);
        canal.setDescription(getString(R.string.default_notification_channel_description));
        canal.enableVibration(true);
        canal.setShowBadge(true);
        canal.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
        gerente.createNotificationChannel(canal);
    }
}
