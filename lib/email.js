// Sends real email via the Resend API when RESEND_API_KEY is set.
// Falls back to a "simulated" send (logged only) so the app runs fully
// out of the box with zero email setup required.

async function sendEmail({ to, from, subject, text }) {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.log(`[SIMULATED EMAIL] to:${to} subject:"${subject}"`);
    return { simulated: true, ok: true };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ from, to, subject, text })
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('Email send failed:', err);
      return { simulated: false, ok: false, error: err };
    }
    return { simulated: false, ok: true };
  } catch (err) {
    console.error('Email send error:', err);
    return { simulated: false, ok: false, error: String(err) };
  }
}

module.exports = { sendEmail };
