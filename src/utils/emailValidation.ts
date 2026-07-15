export const BLOCKED_EMAIL_DOMAINS = new Set([
  "yopmail.com", "yopmail.fr", "yopmail.net", "cool.fr.nf", "jetable.fr.nf", "nospam.ze.tc", "nomail.xl.cx", "mega.zik.dj",
  "mailinator.com", "mailinator.net", "mailinator.org", "maildrop.cc", "mailnesia.com", "mailcatch.com", "mailmetrash.com",
  "guerrillamail.com", "guerrillamail.net", "guerrillamail.org", "guerrillamail.biz", "guerrillamail.de", "sharklasers.com", "grr.la", "guerrillamailblock.com",
  "10minutemail.com", "10minutemail.net", "10mail.org", "20minutemail.com", "tempmail.com", "temp-mail.org", "tempail.com", "tempmailo.com",
  "mail.tm", "dropmail.me", "dropmail.xyz", "getnada.com", "getairmail.com", "emailondeck.com", "fakeinbox.com", "dispostable.com",
  "throwawaymail.com", "trashmail.com", "trashmail.net", "mytrashmail.com", "spamgourmet.com", "spam4.me", "mintemail.com", "mohmal.com", "harakirimail.com",
  "inboxbear.com", "mailpoof.com", "mailnull.com", "mailinator2.com", "mail-temporaire.fr", "temporary-mail.net", "tempinbox.com", "tempemail.net",
  "temp-mail.ru", "mailforspam.com", "mailimate.com", "mailinator.gq", "burnermail.io", "simplelogin.io", "anonaddy.com", "addy.io", "relay.firefox.com",
  "secmail.pw", "secmail.pro", "secmail.net", "1secmail.com", "1secmail.org", "1secmail.net", "tmail.ws", "tmailor.com", "tmailor.net", "tmails.net", "tmpmail.org", "tmpeml.com",
  "fakemail.net", "fakemailgenerator.com", "emailfake.com", "emailfake.net", "fake-mail.ml", "fakemailz.com", "bccto.me", "spambox.us", "spambox.xyz", "spamdecoy.net", "spamfree24.org",
  "luxusmail.org", "trashymail.com", "trashdevil.com", "wegwerfemail.de", "wegwerfmail.de", "disposableemailaddresses.com", "discard.email", "discardmail.com", "discardmail.de",
  "mail7.io", "mail7.net", "mail7.org", "mailbox.in.ua", "mailboxy.fun", "emlhub.com", "emltmp.com", "emlpro.com", "freeml.net", "anonbox.net", "mailmenot.io", "privy-mail.de",
  "temp-mail.io", "tempmail.plus", "tempmail.dev", "tempmail.world", "tempmail.lol", "mailhost.top", "mail4you.men", "best-mail.net", "freemail4.info",
  "0-mail.com", "0815.ru", "0clickemail.com", "0wnd.net", "0wnd.org", "47t.de", "7dmail.com", "mail.ee", "mail.cx", "mail.ac", "mail.kz",
]);

export const isBlockedEmail = (email: unknown) => {
  const normalized = String(email || "").trim().toLowerCase();
  const atIndex = normalized.lastIndexOf("@");
  return atIndex > 0 && atIndex < normalized.length - 1 &&
    BLOCKED_EMAIL_DOMAINS.has(normalized.slice(atIndex + 1));
};

export const allowedEmailValidator = {
  validator: (email: unknown) => !email || !isBlockedEmail(email),
  message: "Disposable or temporary email addresses are not allowed",
};

export const assertAllowedEmail = (email: unknown) => {
  if (email && isBlockedEmail(email)) throw new Error("DISPOSABLE_EMAIL_NOT_ALLOWED");
};
