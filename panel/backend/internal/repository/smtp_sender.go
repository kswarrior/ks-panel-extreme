package repository

import (
	"crypto/tls"
	"fmt"
	"net"
	"net/smtp"
	"strings"
	"time"
)

// SMTPSender mails a verification code to the supplied address using the
// settings currently stored in the DB. An empty SMTP host short-circuits
// successfully (no-op) so tests/early-install state where no SMTP block is
// configured don't hard-fail the registration flow — the verify page simply
// won't reach an inbox until the admin finishes wiring SMTP.
//
// The body is a tiny plaintext email; the recipients are BCC'd once.
func (r *SettingsRepository) SMTPSender() *smtpSettingsRepo {
	return &smtpSettingsRepo{repo: r}
}

type smtpSettingsRepo struct {
	repo *SettingsRepository
}

// SendVerificationCode mails the numeric code to the user. It returns an
// error suitable for surfacing to the operator (without leaking internal
// SMTP details); a nil error means the message was handed to the SMTP
// server (the server may still bounce later — we can't observe that).
func (s *smtpSettingsRepo) SendVerificationCode(to, code, panelName string) error {
	host, _, _, _, _ := s.repo.SMTPConfig()
	if strings.TrimSpace(host) == "" {
		return fmt.Errorf("SMTP is not configured")
	}
	subject := "Verify your " + panelName + " account"
	body := fmt.Sprintf("Your verification code is: %s\n\nIt expires in 15 minutes.\n", code)
	return s.SendMail(to, subject, body)
}

// buildEmail assembles the minimal RFC822 headers + body the Postfix / Gmail
// / Mailtrap relays we expect admins to point at all accept uniformly.
func buildEmail(from, to, subject, body string) []byte {
	return []byte("From: " + from + "\r\n" +
		"To: " + to + "\r\n" +
		"Subject: " + subject + "\r\n" +
		"MIME-Version: 1.0\r\n" +
		"Content-Type: text/plain; charset=UTF-8\r\n" +
		"\r\n" +
		body)
}

// sendTLS dials an implicit-TLS SMTP port (465). The stdlib's smtp package has
// no helper for implicit TLS, so we open the TLS connection ourselves, attach
// a smtp.NewClient to it, auth, and send — mirroring smtp.SendMail's body.
// The dial is bounded (15s, same as sendPlain) so a hung relay cannot park
// the mail worker forever and stall the 256-slot queue behind it.
func sendTLS(addr, host string, auth smtp.Auth, from string, to []string, msg []byte) error {
	dialer := &net.Dialer{Timeout: 15 * time.Second}
	conn, err := tls.DialWithDialer(dialer, "tcp", addr, &tls.Config{ServerName: host})
	if err != nil {
		return err
	}
	defer conn.Close()
	c, err := smtp.NewClient(conn, host)
	if err != nil {
		return err
	}
	defer c.Quit()
	if err := c.Mail(from); err != nil {
		return err
	}
	for _, rcpt := range to {
		if err := c.Rcpt(rcpt); err != nil {
			return err
		}
	}
	w, err := c.Data()
	if err != nil {
		return err
	}
	if _, err := w.Write(msg); err != nil {
		return err
	}
	if err := w.Close(); err != nil {
		return err
	}
	return nil
}
