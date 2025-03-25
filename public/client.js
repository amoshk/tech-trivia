const socket = io();

const loginSection = document.getElementById('loginSection');
const gameSection = document.getElementById('gameSection');
const joinBtn = document.getElementById('joinBtn');
const playerNameInput = document.getElementById('playerName');
const isHostCheckbox = document.getElementById('isHost');
const startGameBtn = document.getElementById('startGameBtn');
const nextQuestionBtn = document.getElementById('nextQuestionBtn');
const evaluateRoundBtn = document.getElementById('evaluateRoundBtn');
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

// Helper to append messages
function addMessage(msg) {
  const p = document.createElement('p');
  p.textContent = msg;
  messagesDiv.appendChild(p);
}

// Join button event listener
joinBtn.addEventListener('click', () => {
  const isHost = isHostCheckbox.checked;
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
      li.textContent = `${player.name}`;
      playersUl.appendChild(li);
    });
  }
});

// Additional event listeners for game events can be added below
socket.on('newQuestion', (data) => {
  questionText.textContent = `Q${data.index}/${data.total}: ${data.question}`;
  messagesDiv.innerHTML = '';
  // Reset answer area for new question (only for non-hosts)
  if (!isHost) {
    answerArea.classList.remove('waiting');
    waitingScreen.classList.add('hidden');
    answerInput.disabled = false;
    submitAnswerBtn.disabled = false;
  }
});

socket.on('roundResult', (data) => {
  addMessage(`Correct Answer: ${data.correctAnswer}`);
  if (data.winner) {
    addMessage(`Round Winner: ${data.winner}`);
  } else {
    addMessage('No valid answer this round.');
  }
});

// Display leaderboard and winner banner only on host screen after game ends
socket.on('gameEnded', (data) => {
  if (isHost) {
    // Prepare leaderboard HTML
    let leaderboardHTML = '<h2>Leaderboard</h2><ol>';
    if (data.leaderboard && Array.isArray(data.leaderboard)) {
      data.leaderboard.forEach(player => {
        leaderboardHTML += `<li>${player.name} - Score: ${player.score}</li>`;
      });
    }
    leaderboardHTML += '</ol>';
    // Create winner banner if a winner exists
    let winnerBannerHTML = '';
    if (data.winner) {
      winnerBannerHTML = `<div id="winnerBanner">
  <h2>You're winner!</h2>
  <p>Congratulations ${data.winner}, everyone sends their congratulations!</p>
</div>`;
    }
    leaderboardSection.innerHTML = winnerBannerHTML + leaderboardHTML;
    leaderboardSection.classList.remove('hidden');
  }
});