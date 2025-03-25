const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs');
const path = require('path');

// Load questions from file
const questionsPath = path.join(__dirname, 'questions.json');
let questions = [];
try {
  const data = fs.readFileSync(questionsPath, 'utf8');
  questions = JSON.parse(data);
} catch (err) {
  console.error('Error reading questions:', err);
}

// Game state
let players = {}; // { socketId: { name, score, isHost } }
let currentQuestionIndex = -1;
let currentQuestion = null;
let submittedAnswers = {}; // { socketId: { answer, name } }

// Helper function to filter out host from players list for display
function getNonHostPlayers() {
  const filtered = {};
  for (const pid in players) {
    if (!players[pid].isHost) {
      filtered[pid] = players[pid];
    }
  }
  return filtered;
}

function getLeaderBoard(){
  return Object.values(getNonHostPlayers()).sort((a, b) => b.score - a.score);
}

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files from the public folder
app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
  console.log('New client connected: ', socket.id);

  // When a client joins
  socket.on('join', (data) => {
    // data: { name?: string, isHost: boolean, customQuestions?: string }
    if (data.isHost) {
      // For host, assign default name "Host" and check for custom questions JSON
      players[socket.id] = {
        name: "Host",
        score: 0,
        isHost: true
      };
      if (data.customQuestions) {
        try {
          const custom = JSON.parse(data.customQuestions);
          if (Array.isArray(custom)) {
            questions = custom;
            console.log("Custom questions loaded by host.");
          }
        } catch (err) {
          console.error("Failed to parse custom questions JSON:", err);
        }
      }
    } else {
      // For normal players, require a name
      if (!data.name || data.name.trim() === "") return;
      players[socket.id] = {
        name: data.name,
        score: 0,
        isHost: false
      };
    }
    // Emit playersUpdate filtered to exclude host(s)
    io.emit('playersUpdate', getNonHostPlayers());
  });

  // Host starts new game
  socket.on('startGame', () => {
    if (!players[socket.id] || !players[socket.id].isHost) {
      return;
    }
    currentQuestionIndex = -1;
    // Reset all scores (only for non-host players)
    Object.keys(players).forEach(pid => {
      if (!players[pid].isHost) {
        players[pid].score = 0;
      }
    });
    io.emit('playersUpdate', getNonHostPlayers());
    socket.emit('message', 'Game started!');
  });

  // Host moves to next question
  socket.on('nextQuestion', () => {
    if (!players[socket.id] || !players[socket.id].isHost) {
      return;
    }
    currentQuestionIndex++;
    if (currentQuestionIndex >= questions.length) {
      io.emit('message', 'No more questions. End of game.');
      // Compute leaderboard sorted by score descending
      const leaderboard = getLeaderBoard();
      // Determine winner(s) based on highest score
      let winners = [];
      if (leaderboard.length > 0) {
        const topScore = leaderboard[0].score;
        winners = leaderboard.filter(player => player.score === topScore).map(player => player.name);
      }
      io.emit('gameEnded', { leaderboard, winners });
      return;
    }
    currentQuestion = questions[currentQuestionIndex];
    submittedAnswers = {}; // reset answers for round
    io.emit('newQuestion', { 
      question: currentQuestion.question, 
      index: currentQuestionIndex + 1,
      total: questions.length
    });
    //io.emit('message', `Question ${currentQuestionIndex + 1}: ${currentQuestion.question}`);
  });

  // When a player submits an answer
  socket.on('submitAnswer', (data) => {
    // data: { answer: number }
    if (!currentQuestion) return;
    const answer = parseFloat(data.answer);
    if (isNaN(answer)) return;
    submittedAnswers[socket.id] = {
      answer,
      name: players[socket.id] ? players[socket.id].name : 'Unknown'
    };
    socket.emit('message', `Your answer of ${answer} is submitted.`);
  });

  // Host triggers round evaluation
  socket.on('evaluateRound', () => {
    if (!players[socket.id] || !players[socket.id].isHost) {
      return;
    }
    if (!currentQuestion) return;
    const correctAnswer = parseFloat(currentQuestion.answer);
    
    // Partition answers
    let nonExceeding = [];
    let exceeding = [];
  
    for (let pid in submittedAnswers) {
      const entry = submittedAnswers[pid];
      if (entry.answer <= correctAnswer) {
        nonExceeding.push({ socketId: pid, name: entry.name, answer: entry.answer });
      } else {
        exceeding.push({ socketId: pid, name: entry.name, answer: entry.answer });
      }
    }
  
    // Sort nonExceeding descending (closest to correct is highest)
    nonExceeding.sort((a, b) => b.answer - a.answer);
    // Sort exceeding ascending (closest above correct)
    exceeding.sort((a, b) => a.answer - b.answer);
  
    // Award points: 5 for closest, 3 for 2nd, 1 for 3rd (with ties)
    let pointsMap = {};
    let distinctRank = 0;
    let lastAnswer = null;
  
    nonExceeding.forEach(entry => {
      if (lastAnswer === null || entry.answer !== lastAnswer) {
        distinctRank++;
        lastAnswer = entry.answer;
      }
      if (distinctRank === 1) {
        pointsMap[entry.socketId] = 5;
      } else if (distinctRank === 2) {
        pointsMap[entry.socketId] = 3;
      } else if (distinctRank === 3) {
        pointsMap[entry.socketId] = 1;
      }
    });
  
    // Apply points to players (only non-host players)
    Object.keys(pointsMap).forEach(pid => {
      if (players[pid] && !players[pid].isHost) {
        players[pid].score += pointsMap[pid];
      }
    });
  
    // Determine round winner(s): those with the highest nonExceeding answer
    let roundWinners = [];
    if (nonExceeding.length > 0) {
      const bestAnswer = nonExceeding[0].answer;
      roundWinners = nonExceeding.filter(e => e.answer === bestAnswer).map(e => e.name);
    }
  
    // Truncate lists for host display (max 5 entries each)
    const displayNonExceeding = nonExceeding.slice(0, 5).map(entry => ({ name: entry.name, answer: entry.answer }));
    const displayExceeding = exceeding.slice(0, 5).map(entry => ({ name: entry.name, answer: entry.answer }));
    const leaderboared = getLeaderBoard();    
    
    io.emit('roundResult', { 
      correctAnswer, 
      winners: roundWinners, 
      awardedPoints: pointsMap,
      nonExceeding: displayNonExceeding,
      exceeding: displayExceeding,
      leaderboard: leaderboared,
      submittedAnswers
    });
    io.emit('playersUpdate', getNonHostPlayers());
  });

  // When a client disconnects
  socket.on('disconnect', () => {
    console.log('Client disconnected: ', socket.id);
    delete players[socket.id];
    io.emit('playersUpdate', getNonHostPlayers());
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
