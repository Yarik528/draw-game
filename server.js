const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

app.use(express.static(path.join(__dirname)));

// Хранилище комнат (в памяти)
// Структура: { roomId: { players: { socketId: {nickname, avatar} }, word: null } }
let rooms = {};

io.on('connection', (socket) => {
    console.log('Новый игрок:', socket.id);

    // Вход в комнату
    socket.on('joinRoom', ({ roomId, nickname, avatar }) => {
        const roomExists = rooms[roomId];
        
        // Если комнаты нет, создаем её
        if (!roomExists) {
            rooms[roomId] = { players: {}, word: null };
        }
        
        // Ограничение на 2 игрока для простоты
        if (Object.keys(rooms[roomId].players).length >= 7) {
            socket.emit('errorMsg', 'Комната переполнена!');
            return;
        }

        socket.join(roomId);
        socket.roomId = roomId;
        
        // Сохраняем данные игрока
        rooms[roomId].players[socket.id] = { nickname, avatar };

        // Уведомляем всех в комнате об обновлении списка игроков
        io.to(roomId).emit('updatePlayers', rooms[roomId].players);
        
        // Если уже есть 2 игрока, сообщаем им, что можно начинать
        if (Object.keys(rooms[roomId].players).length === 2) {
            io.to(roomId).emit('gameReady');
        }
    });

    // Синхронизация рисования
    socket.on('draw', (data) => {
        // data содержит координаты, цвет, толщину
        // Отправляем всем в комнате, КРОМЕ того, кто рисует (чтобы не лагало у автора)
        socket.to(socket.roomId).emit('draw', data);
    });

    // Очистка холста
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

        // Отправляем сообщение всем + флаг, угадал ли кто-то
        io.to(roomId).emit('chatMessage', { 
            user: rooms[roomId].players[socket.id].nickname, 
            text: msg, 
            correct: isCorrect,
            avatar: rooms[roomId].players[socket.id].avatar
        });

        if (isCorrect) {
            io.to(roomId).emit('winGame', currentWord);
            rooms[roomId].word = null; // Сброс слова
        }
    });

    // Установка загаданного слова (делает художник)
    socket.on('setSecretWord', (word) => {
        if (rooms[socket.roomId]) {
            rooms[socket.roomId].word = word;
        }
    });

    // Выход из игры
    socket.on('disconnect', () => {
        if (socket.roomId && rooms[socket.roomId]) {
            delete rooms[socket.roomId].players[socket.id];
            io.to(socket.roomId).emit('updatePlayers', rooms[socket.roomId].players);
            
            // Если комната пуста, удаляем её
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
    console.log(`Сервер запущен на http://localhost:${PORT}`);
});