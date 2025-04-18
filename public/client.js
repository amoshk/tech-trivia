// Global flag for host status and chart instance
let isHost = false;
let answersChart = null;
let countdownValue = 30;
let countdownInterval = null;

const socket = io();

const loginSection = document.getElementById('loginSection');
const gameSection = document.getElementById('gameSection');
const joinBtn = document.getElementById('joinBtn');
const playerNameInput = document.getElementById('playerName');
const isHostCheckbox = document.getElementById('isHost');
const startGameBtn = document.getElementById('startGameBtn');
const nextQuestionBtn = document.getElementById('nextQuestionBtn');
const evaluateRoundBtn = document.getElementById('evaluateRoundBtn');
const questionArea = document.getElementById('questionArea');
const questionText = document.getElementById('questionText');
const answerInput = document.getElementById('answerInput');
const submitAnswerBtn = document.getElementById('submitAnswerBtn');
const waitingScreen = document.getElementById('waitingScreen');
const messagesDiv = document.getElementById('messages');
const playersUl = document.getElementById('playersUl');
const playersList = document.getElementById('playersList');
const gameControlsDiv = document.getElementById('gameControls');
const leaderboardSection = document.getElementById('leaderboardSection');
const answerArea = document.getElementById('answerArea');
const playerScoreDiv = document.getElementById('playerScore');
const answersChartEl = document.getElementById('answersChart');
const gameInstruction = document.getElementById('gameInstruction'); 
const timerDisplay = document.getElementById('timerDisplay');

// Toggle custom questions textarea visibility based on host selection
isHostCheckbox.addEventListener('change', () => {
  if (isHostCheckbox.checked) {
    customQuestionsContainer.style.display = 'block';
    playerNameInput.disabled = true;
  } else {
    customQuestionsContainer.style.display = 'none';
    playerNameInput.disabled = false;
  }
});

// Countdown timer function that resets with every new question
function startCountdown() {
  clearInterval(countdownInterval);
  countdownValue = 12;
  timerDisplay.textContent = `Time Left: ${countdownValue} seconds`;
  countdownInterval = setInterval(() => {
    countdownValue--;
    timerDisplay.textContent = `Time Left: ${countdownValue} seconds`;
    if (countdownValue <= 0) {
      clearInterval(countdownInterval);
      // Optionally: inform the server or notify the user that time is up
    }
  }, 1000);
}

// Helper to append messages
function addMessage(msg) {
  const p = document.createElement('p');
  p.textContent = msg;
  messagesDiv.appendChild(p);
}

// Join button event listener
joinBtn.addEventListener('click', () => {
  isHost = isHostCheckbox.checked;
  if (!isHost && playerNameInput.value.trim() === '') {
    alert('Please enter a name.');
    return;
  }
  const joinData = { isHost };
  if (isHost) {
    const customQuestions = document.getElementById('customQuestions').value.trim();
    if (customQuestions) {
      joinData.customQuestions = customQuestions;
    }
  } else {
    joinData.name = playerNameInput.value.trim();
  }
  socket.emit('join', joinData);
  loginSection.classList.add('hidden');
  gameSection.classList.remove('hidden');
  gameInstruction.classList.add('hidden');

  // Hide host answer input if user is host, otherwise hide players list
  if (isHost) {
    if (answerArea) {
      answerArea.style.display = 'none';
    }
    if (gameControls) {
      gameControls.classList.remove('hidden');
    }
  // } else {
  //   if (playersList) {
  //     playersList.style.display = 'none';
  //   }
  }
});

// Host controls events
if (startGameBtn) {
  startGameBtn.addEventListener('click', () => {
    socket.emit('startGame');
    // Automatically trigger the first question for host
    socket.emit('nextQuestion');
  });
}

if (nextQuestionBtn) {
  nextQuestionBtn.addEventListener('click', () => {
    socket.emit('nextQuestion');
  });
}

if (evaluateRoundBtn) {
  evaluateRoundBtn.addEventListener('click', () => {
    socket.emit('evaluateRound');
  });
}

// Submit answer event (for non-host players)
submitAnswerBtn.addEventListener('click', () => {
  const answer = answerInput.value;
  if (!answer) return alert('Please enter an answer.');
  socket.emit('submitAnswer', { answer });
  // Clear answer input and show waiting screen
  answerInput.value = '';
  answerArea.classList.add('waiting');
  waitingScreen.classList.remove('hidden');
  // Optionally disable the answer input and submit button
  answerInput.disabled = true;
  submitAnswerBtn.disabled = true;
});

// Listen for server messages
socket.on('message', (message) => {
  const p = document.createElement('p');
  p.textContent = message;
  messagesDiv.appendChild(p);
});

// Update players list based on server update (only for host)
socket.on('playersUpdate', (players) => {
  if (playersList && playersList.style.display !== 'none') {
    playersUl.innerHTML = '';
    Object.values(players).forEach((player) => {
      const li = document.createElement('li');
      // Append tick mark if player has submitted answer
      const tickMark = player.submitted ? ' ✔' : '';
      li.textContent = `${player.name}${tickMark}`;
      playersUl.appendChild(li);
    });
  }
});

// Additional event listeners for game events can be added below
socket.on('newQuestion', (data) => {
  timerDisplay.classList.remove('hidden');
  nextQuestionBtn.disabled = true;
  evaluateRoundBtn.disabled = false;
  startCountdown();
  questionText.textContent = `Q${data.index}/${data.total}: ${data.question}`;
  messagesDiv.innerHTML = '';
  // Reset answer area for new question (only for non-hosts)
  if (!isHost) {
    answerArea.classList.remove('waiting');
    waitingScreen.classList.add('hidden');
    answerInput.disabled = false;
    submitAnswerBtn.disabled = false;
  } else {
    leaderboardSection.classList.add('hidden');
    startGameBtn.classList.add('hidden')
    answersChartEl.style.display = 'none';
  }
});

socket.on('roundResult', (data) => {
  timerDisplay.classList.add('hidden');
  nextQuestionBtn.disabled = false;
  evaluateRoundBtn.disabled = true;
  addMessage(`Correct Answer: ${data.correctAnswer}`);
  if (data.winners && data.winners.length > 0) {
    const winnersStr = data.winners.join(', ');
    addMessage(`Round Winner(s): ${winnersStr}`);
  } else {
    addMessage('No winner of this round.');
  }
  // Display leaderboard
  if(isHost){
    leaderboardSection.innerHTML = createLeaderBoardHtml(data.leaderboard);
    leaderboardSection.classList.remove('hidden');

    // Show the chart canvas element
    answersChartEl.style.display = 'block';
    // Extract labels and data from submitted answers
    // Using Object.values to get the { name, answer } entries
    const submissions = Object.values(data.submittedAnswers);
    const labels = submissions.map(entry => entry.name);
    const dataPoints = submissions.map(entry => entry.answer);

    // If a chart already exists, destroy it before creating a new one
    if (answersChart) {
      answersChart.destroy();
    }

    const ctx = answersChartEl.getContext('2d');
    answersChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Player Answers',
          data: dataPoints,
          borderWidth: 10,
          borderColor: 'rgba(75, 192, 192, 1)',
          backgroundColor: 'rgb(248, 248, 248)',
          fill: false,
          tension: 0.1
        }]
      },
      options: {
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              font: {
                  size: 32,
              }
            }
          }
        },
      }
    });
  }
});

// Display leaderboard and winner banner only on host screen after game ends
socket.on('gameEnded', (data) => {
  if (isHost) {
    answersChartEl.style.display = 'none';
    questionArea.style.display = 'none';
    timerDisplay.classList.add('hidden');
    messagesDiv.innerHTML = '';
    // Prepare leaderboard HTML
    let leaderboardHTML = createLeaderBoardHtml(data.leaderboard);
    // Create winner banner if a winner exists
    let winnerBannerHTML = '';
    if (data.winners && data.winners.length > 0)  {
      winnerBannerHTML = `<div id="winnerBanner">
        <img src="winner.jpg" />
        <p>Congratulations ${data.winners.join(', ')}, everyone sends their congratulations!</p>
      </div>`;
    }
    leaderboardSection.innerHTML = winnerBannerHTML + leaderboardHTML;
    leaderboardSection.classList.remove('hidden');
    playersList.classList.add('hidden');
  }
});

function createLeaderBoardHtml(leaderboard){
  let leaderboardHTML = '<h2>Leaderboard</h2><ol>';
  if (leaderboard && Array.isArray(leaderboard)) {
    leaderboard.forEach(player => {
      leaderboardHTML += `<li>${player.name} - Score: ${player.score}</li>`;
    });
  }
  leaderboardHTML += '</ol>';
  return leaderboardHTML;
}