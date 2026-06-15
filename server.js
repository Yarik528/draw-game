const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

app.use(express.static(path.join(__dirname)));

let rooms = {};

io.on('connection', (socket) => {
    console.log('Новый игрок:', socket.id);

    // Создание комнаты
    socket.on('createRoom', ({ roomId, nickname, avatar, password }) => {
        if (rooms[roomId]) {
            socket.emit('errorMsg', 'Комната с таким названием уже существует!');
            return;
        }

        rooms[roomId] = { 
            players: {}, 
            word: null, 
            password: password || null 
        };

        socket.join(roomId);
        socket.roomId = roomId;
        rooms[roomId].players[socket.id] = { nickname, avatar };

        io.to(roomId).emit('updatePlayers', rooms[roomId].players);
        io.to(roomId).emit('gameReady');
    });

    // Вход в комнату
    socket.on('joinRoom', ({ roomId, nickname, avatar, password }) => {
        const room = rooms[roomId];
        
        if (!room) {
            socket.emit('errorMsg', 'Комната не найдена!');
            return;
        }

        // Проверка пароля
        if (room.password && room.password !== password) {
            socket.emit('errorMsg', 'Неверный пароль!');
            return;
        }

        if (Object.keys(room.players).length >= 5) {
            socket.emit('errorMsg', 'Комната переполнена!');
            return;
        }

        socket.join(roomId);
        socket.roomId = roomId;
        room.players[socket.id] = { nickname, avatar };

        io.to(roomId).emit('updatePlayers', room.players);
        
        if (Object.keys(room.players).length >= 2) {
            io.to(roomId).emit('gameReady');
        }
    });

    // Рисование
    socket.on('draw', (data) => {
        socket.to(socket.roomId).emit('draw', data);
    });

    socket.on('clearCanvas', () => {
        socket.to(socket.roomId).emit('clearCanvas');
    });

    // Чат и проверка ответа
    socket.on('chatMessage', ({ msg, roomId }) => {
        const currentWord = rooms[roomId]?.word;
        let isCorrect = false;

        if (currentWord && msg.toLowerCase().trim() === currentWord.toLowerCase()) {
            isCorrect = true;
        }

        io.to(roomId).emit('chatMessage', { 
            user: rooms[roomId].players[socket.id].nickname, 
            text: msg, 
            correct: isCorrect,
            avatar: rooms[roomId].players[socket.id].avatar
        });

        if (isCorrect) {
            io.to(roomId).emit('winGame', currentWord);
            rooms[roomId].word = null;
        }
    });

    socket.on('setSecretWord', (word) => {
        if (rooms[socket.roomId]) {
            rooms[socket.roomId].word = word;
        }
    });

    socket.on('disconnect', () => {
        if (socket.roomId && rooms[socket.roomId]) {
            delete rooms[socket.roomId].players[socket.id];
            io.to(socket.roomId).emit('updatePlayers', rooms[socket.roomId].players);
            
            if (Object.keys(rooms[socket.roomId].players).length === 0) {
                delete rooms[socket.roomId];
            } else {
                io.to(socket.roomId).emit('opponentLeft');
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});