// Incident table logic
const incidents = [
    // ...existing code...
];

function renderTable() {
    const tableBody = document.getElementById('incidentTableBody');
    tableBody.innerHTML = '';
    incidents.forEach((incident, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${incident.type}</td>
            <td>${incident.description}</td>
            <td>${incident.date}</td>
            <td class="action-buttons">
                <button class="edit" onclick="editIncident(${index})">Edit</button>
                <button class="delete" onclick="deleteIncident(${index})">Delete</button>
            </td>
        `;
        tableBody.appendChild(row);
    });
}

function editIncident(index) {
    const newDescription = prompt('Edit description:', incidents[index].description);
    if (newDescription !== null) {
        incidents[index].description = newDescription;
        renderTable();
    }
}

function deleteIncident(index) {
    if (confirm('Are you sure you want to delete this incident?')) {
        incidents.splice(index, 1);
        renderTable();
    }
}

// Initial render
renderTable();

// ZCFD-FAS alerting system JS
const token = '7742982738:AAEKDUd43h9v6-TsZ8fRcfNopn2aDQjr1qY';
const chatId = -1002847077785;
let lastMessageId = null;
let queue = [];
let isPlaying = false;
let pollingInterval = null;
let alertingEnabled = false;

// Use localStorage to sync lastMessageId across tabs/windows
function saveLastMessageId(id) {
  try {
    localStorage.setItem('ZCFD_FAS_LAST_ID', id);
  } catch (e) {}
}
function loadLastMessageId() {
  try {
    return localStorage.getItem('ZCFD_FAS_LAST_ID');
  } catch (e) { return null; }
}

// Listen for changes from other tabs
window.addEventListener('storage', (e) => {
  if (e.key === 'ZCFD_FAS_LAST_ID') {
    lastMessageId = e.newValue ? Number(e.newValue) : null;
  }
});

async function fetchAlert() {
  if (!alertingEnabled) return;
  if (isPlaying || queue.length > 0) return;
  try {
    const storedId = loadLastMessageId();
    if (storedId !== null && storedId !== lastMessageId) {
      lastMessageId = Number(storedId);
    }

    const response = await fetch(`https://api.telegram.org/bot${token}/getUpdates`);
    const data = await response.json();

    if (!data.ok || !Array.isArray(data.result)) {
      document.getElementById("status").textContent = "Error: Couldn't fetch updates";
      return;
    }

    // Only accept channel_post from the channel (not private messages)
    const updates = data.result.filter(update =>
      update.channel_post &&
      update.channel_post.chat.id === chatId &&
      update.channel_post.text
    );

    // Sort by update_id ascending
    updates.sort((a, b) => a.update_id - b.update_id);

    let newUpdates = [];
    if (lastMessageId === null) {
      if (updates.length > 0) {
        newUpdates = [updates[updates.length - 1]];
      }
    } else {
      newUpdates = updates.filter(u => u.update_id > lastMessageId);
    }

    if (newUpdates.length > 0) {
      const lastAlertText = document.getElementById("alertBox").textContent.trim();
      const filteredUpdates = newUpdates.filter(u => {
        const text = u.channel_post.text || '';
        const plainText = text.replace(/[*_`~]/g, '').trim();
        return plainText && plainText !== lastAlertText;
      });
      if (filteredUpdates.length > 0) {
        queue = filteredUpdates;
        playNextInQueue();
      }
    }
  } catch (err) {
    console.error(err);
    document.getElementById("status").textContent = "Network or API error";
  }
}

function setAlertingBackground(active) {
    document.body.classList.toggle('alerting-bg', active);
}

function playNextInQueue() {
  if (queue.length === 0) {
    isPlaying = false;
    setAlertingBackground(false);
    return;
  }
  isPlaying = true;
  setAlertingBackground(true);
  const update = queue.shift();
  lastMessageId = update.update_id;
  saveLastMessageId(lastMessageId);

  let text =
    (update.channel_post && update.channel_post.text) ||
    (update.message && update.message.text) ||
    '';

  const plainText = text.replace(/[*_`~]/g, '').replace(/\n+/g, ' ').trim();

  document.getElementById("alertBox").innerHTML = `<span class="marquee">${plainText}</span>`;

  const alertDate = new Date(
    ((update.channel_post && update.channel_post.date) ||
     (update.message && update.message.date) ||
     Date.now()) * 1000
  );
  const dateStr = alertDate.toLocaleString();
  document.getElementById("status").textContent = `Alert time: ${dateStr}`;

  const tone1 = document.getElementById("tone1");
  const tone2 = document.getElementById("tone2");

  function speakTwiceThenTone2() {
    window.speechSynthesis.cancel();
    let count = 0;
    function speakOnce() {
      const speech = new SpeechSynthesisUtterance(plainText);
      speech.lang = 'en-US';
      speech.volume = 1.0;
      speech.onend = () => {
        count++;
        if (count < 2) {
          setTimeout(speakOnce, 1200); // 1.2s pause between readings
        } else {
          setTimeout(() => {
            tone2.currentTime = 0;
            tone2.play().then(() => {
              tone2.onended = () => {
                tone2.onended = null;
                playNextInQueue();
              };
            }).catch(() => {
              playNextInQueue();
            });
          }, 1200); // 1.2s pause before tone2
        }
      };
      speech.onerror = () => {
        count++;
        if (count < 2) {
          setTimeout(speakOnce, 1200);
        } else {
          setTimeout(() => {
            tone2.currentTime = 0;
            tone2.play().then(() => {
              tone2.onended = () => {
                tone2.onended = null;
                playNextInQueue();
              };
            }).catch(() => {
              playNextInQueue();
            });
          }, 1200);
        }
      };
      window.speechSynthesis.speak(speech);
    }
    speakOnce();
  }

  tone1.currentTime = 0;
  tone1.onended = () => {
    tone1.onended = null;
    speakTwiceThenTone2();
  };
  tone1.play().catch(() => {
    speakTwiceThenTone2();
  });
}

function stopAlerting() {
  alertingEnabled = false;
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
  document.getElementById('startBtn').textContent = "Start Alerting";
  document.getElementById('status').textContent = "Alerting stopped.";
}

function startAlerting() {
  alertingEnabled = true;
  document.getElementById('startBtn').textContent = "Stop Alerting";
  document.getElementById('status').textContent = "Alerting enabled.";
  if (window.AudioContext && AudioContext.prototype.resume) {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      ctx.resume();
    } catch (e) {}
  }
  if (!pollingInterval) {
    fetchAlert();
    pollingInterval = setInterval(fetchAlert, 1000);
  }
}

// Move all code that needs DOM elements inside DOMContentLoaded
window.addEventListener('DOMContentLoaded', () => {
    // Incident table logic
    renderTable();

    // ZCFD-FAS alerting system logic
    startAlerting();

    document.getElementById('startBtn').addEventListener('click', function() {
        if (alertingEnabled) {
            stopAlerting();
        } else {
            startAlerting();
        }
    });
});