import { permanentRedirect } from "next/navigation";

/**
 * Eski sakin portalı → `/panel`.
 *
 * Sakin ekranları artık panelin içinde: aynı kabuk, aynı bildirim zili, aynı
 * tema ve erişilebilirlik ayarları. İki ayrı kabuk bakmak, ikisinden birinin
 * geride kalması demekti — nitekim bu sayfa tek ekranlık kalmıştı; sakinin
 * ödeme geçmişi, talepleri, mesajları ve bilgileri hiç yoktu.
 *
 * Kalıcı yönlendirme, çünkü adres değişimi geri alınacak bir deneme değil:
 * eski bağlantıyı (e-posta, WhatsApp bildirimi) tıklayan sakin doğru yere
 * düşmeli.
 */
export default function ResidentPortalRedirect(): never {
  permanentRedirect("/panel");
}
