'use strict';
/* ================================================================
   THREAT LEVEL TRIVIA — Donate / Party Planning Committee Modal
   ================================================================ */

const DONATE_QUOTES = [
  {
    text: "You've been answering Office trivia for free this whole time. I'm just going to leave that right there.",
    character: "Jim Halpert"
  },
  {
    text: "A good man provides. A great man provides, and also announces that he is providing, so everyone knows.",
    character: "Michael Scott"
  },
  {
    text: "Financial contributions fund operations. Operations fund excellence. Excellence is non-negotiable. Contribute.",
    character: "Dwight Schrute"
  },
  {
    text: "I once gave $40 to a slot machine. It did not come back. But at least I did something. So.",
    character: "Kevin Malone"
  },
  {
    text: "The Party Planning Committee runs on passion, creativity, and occasionally, outside funding. Mostly passion. But the funding really helps.",
    character: "Phyllis Vance"
  },
  {
    text: "You miss 100% of the shots you don't take. - Wayne Gretzky",
    character: "Michael Scott"
  },
  {
    text: "I have been very blessed in this life. With good looks, a great personality, and an above-average car. But it all started with people believing in me. You could be that for someone.",
    character: "Michael Scott"
  },
  {
    text: "I don't know what's happening, but I am very comfortable with it.",
    character: "Creed Bratton"
  },
];

function openDonateModal() {
  const quote = DONATE_QUOTES[Math.floor(Math.random() * DONATE_QUOTES.length)];
  document.getElementById('donate-quote-text').textContent = '“' + quote.text + '”';
  document.getElementById('donate-quote-attr').textContent = '- ' + quote.character;
  document.getElementById('donate-modal').classList.remove('hidden');
  document.body.classList.add('modal-open');
}

function closeDonateModal() {
  document.getElementById('donate-modal').classList.add('hidden');
  document.body.classList.remove('modal-open');
}

function initDonate() {
  document.getElementById('btn-donate').addEventListener('click', openDonateModal);
  document.getElementById('btn-donate-close').addEventListener('click', closeDonateModal);
  document.getElementById('btn-donate-cancel').addEventListener('click', closeDonateModal);

  document.getElementById('donate-modal').addEventListener('click', e => {
    if (e.target === document.getElementById('donate-modal')) closeDonateModal();
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !document.getElementById('donate-modal').classList.contains('hidden')) {
      closeDonateModal();
    }
  });
}
