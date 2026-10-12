import { el, esc, rich } from '../lib/dom.js';
import { icons } from '../lib/icons.js';
import { contact, site } from '../data/content.js';
import { ContactForm } from './ContactForm.js';

export function ContactSection() {
  const form = ContactForm({ idPrefix: 'contact' });
  const root = el(`
    <section class="section" id="contact" aria-labelledby="contact-title">
      <div class="container contact__grid">
        <div>
          <header class="section-head">
            <p class="eyebrow">${esc(contact.eyebrow)}</p>
            <h2 class="section-title" id="contact-title">${rich(contact.title)}</h2>
            <p class="section-lead">${esc(contact.lead)}</p>
          </header>
          <p class="contact__response"><span class="hero__dot" aria-hidden="true"></span>${esc(site.owner)} · ${esc(site.responseTime)}</p>
          <div class="contact__channels">
            <a class="channel" href="${site.telegram.href}" target="_blank" rel="noopener">
              <span class="channel__icon" aria-hidden="true">${icons.telegram}</span>
              <span><span class="channel__label">Telegram</span><span class="channel__value">${esc(site.telegram.label)}</span></span>
            </a>
            <a class="channel" href="mailto:${site.email}">
              <span class="channel__icon" aria-hidden="true">${icons.mail}</span>
              <span><span class="channel__label">Почта</span><span class="channel__value">${esc(site.email)}</span></span>
            </a>
          </div>
        </div>
        <div class="card contact__form" data-slot="form"></div>
      </div>
    </section>
  `);
  root.querySelector('[data-slot="form"]').append(form.el);
  return { el: root, mount: () => form.mount(), destroy: () => form.destroy() };
}
