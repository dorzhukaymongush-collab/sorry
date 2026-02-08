// ============================================
// GOOGLE SHEETS DATABASE FOR "PROSTI" SITE
// ============================================

class GoogleSheetsDB {
    constructor() {
        // ⚠️ ВАЖНО: Замени этот URL на свой из Google Apps Script!
        this.SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzo9OL849VkHwZwRkWeR15oCjo3OFHH5D6NgzkIlBFTtLh-NwoWFvCeIGC5uDgtB89z/exec';
        
        this.isOnline = true;
        this.letters = [];
        this.localQueue = [];
        this.init();
    }
    
    async init() {
        console.log('📊 Инициализация Google Sheets базы данных...');
        
        // Проверяем подключение
        await this.checkConnection();
        
        // Загружаем письма
        await this.loadLetters();
        
        // Обрабатываем очередь локальных писем
        await this.processLocalQueue();
        
        // Запускаем периодическую синхронизацию
        this.startSync();
    }
    
    async checkConnection() {
        try {
            const response = await axios.get(this.SCRIPT_URL + '?action=ping', { timeout: 5000 });
            this.isOnline = response.data === 'pong';
            console.log(this.isOnline ? '✅ Подключение к базе данных установлено' : '❌ Нет подключения к базе');
        } catch (error) {
            this.isOnline = false;
            console.warn('⚠️ Нет подключения к интернету. Используем локальное хранилище.');
        }
    }
    
    async loadLetters() {
        try {
            if (this.isOnline) {
                // Загружаем с Google Sheets
                const response = await axios.get(this.SCRIPT_URL + '?action=getLetters');
                this.letters = response.data.filter(letter => this.isLetterValid(letter));
                console.log(`✅ Загружено ${this.letters.length} писем с сервера`);
            } else {
                // Загружаем из localStorage
                const saved = localStorage.getItem('prosti_letters_backup');
                this.letters = saved ? JSON.parse(saved).filter(letter => this.isLetterValid(letter)) : [];
                console.log(`📁 Загружено ${this.letters.length} писем из локального хранилища`);
            }
            
            // Сохраняем резервную копию
            this.saveBackup();
            
            // Обновляем интерфейс
            this.updateUI();
            
        } catch (error) {
            console.error('❌ Ошибка загрузки писем:', error);
            this.fallbackToLocal();
        }
    }
    
    async saveLetter(text) {
        const newLetter = {
            id: 'letter_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            text: text,
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
            views: 0,
            reactions: { fire: 0, heartbreak: 0, understand: 0, sparkle: 0 },
            comments: [],
            local: !this.isOnline // Помечаем локальные письма
        };
        
        if (this.isOnline) {
            try {
                // Отправляем на сервер
                const response = await axios.post(this.SCRIPT_URL, {
                    action: 'addLetter',
                    letter: newLetter
                });
                
                if (response.data.success) {
                    // Добавляем в локальный массив
                    this.letters.unshift(newLetter);
                    this.saveBackup();
                    this.updateUI();
                    
                    console.log('✅ Письмо сохранено на сервере');
                    return { success: true, letter: newLetter, message: 'Письмо брошено в огонь! Его увидят все!' };
                }
            } catch (error) {
                console.warn('⚠️ Не удалось сохранить на сервер. Сохраняем локально.');
                this.isOnline = false;
            }
        }
        
        // Сохраняем локально
        newLetter.local = true;
        this.letters.unshift(newLetter);
        this.localQueue.push(newLetter);
        this.saveBackup();
        this.updateUI();
        
        return { 
            success: true, 
            letter: newLetter, 
            message: 'Письмо сохранено локально. Отправлено в очередь на синхронизацию.' 
        };
    }
    
    async updateLetter(letterId, updates) {
        const letterIndex = this.letters.findIndex(l => l.id === letterId);
        if (letterIndex === -1) return { success: false, error: 'Письмо не найдено' };
        
        // Обновляем локально
        this.letters[letterIndex] = { ...this.letters[letterIndex], ...updates };
        
        if (this.isOnline) {
            try {
                const response = await axios.post(this.SCRIPT_URL, {
                    action: 'updateLetter',
                    letterId: letterId,
                    updates: updates
                });
                
                if (response.data.success) {
                    this.saveBackup();
                    return { success: true };
                }
            } catch (error) {
                console.warn('⚠️ Не удалось обновить на сервере');
            }
        }
        
        // Помечаем для синхронизации
        this.localQueue.push({ ...this.letters[letterIndex], _action: 'update' });
        this.saveBackup();
        
        return { success: true };
    }
    
    async addComment(letterId, commentText) {
        const letter = this.letters.find(l => l.id === letterId);
        if (!letter) return { success: false, error: 'Письмо не найдено' };
        
        const comment = {
            id: 'comment_' + Date.now(),
            text: commentText,
            createdAt: new Date().toISOString()
        };
        
        if (!letter.comments) letter.comments = [];
        letter.comments.push(comment);
        
        return await this.updateLetter(letterId, { comments: letter.comments });
    }
    
    async addReaction(letterId, reactionType) {
        const letter = this.letters.find(l => l.id === letterId);
        if (!letter) return { success: false, error: 'Письмо не найдено' };
        
        if (!letter.reactions[reactionType]) {
            letter.reactions[reactionType] = 0;
        }
        letter.reactions[reactionType]++;
        
        return await this.updateLetter(letterId, { reactions: letter.reactions });
    }
    
    async processLocalQueue() {
        if (!this.isOnline || this.localQueue.length === 0) return;
        
        console.log(`🔄 Синхронизация ${this.localQueue.length} писем из очереди...`);
        
        for (const item of [...this.localQueue]) {
            try {
                if (item._action === 'update') {
                    await axios.post(this.SCRIPT_URL, {
                        action: 'updateLetter',
                        letterId: item.id,
                        updates: item
                    });
                } else {
                    await axios.post(this.SCRIPT_URL, {
                        action: 'addLetter',
                        letter: item
                    });
                }
                
                // Удаляем из очереди после успешной отправки
                this.localQueue = this.localQueue.filter(i => i.id !== item.id);
                console.log(`✅ Синхронизировано письмо: ${item.id}`);
                
            } catch (error) {
                console.warn(`❌ Не удалось синхронизировать письмо ${item.id}`);
                break; // Прерываем при первой ошибке
            }
        }
        
        this.saveBackup();
    }
    
    startSync() {
        // Синхронизация каждые 30 секунд
        setInterval(() => {
            this.checkConnection();
            if (this.isOnline) {
                this.loadLetters();
                this.processLocalQueue();
            }
        }, 30000);
        
        // Обновление интерфейса каждые 10 секунд
        setInterval(() => {
            this.updateUI();
        }, 10000);
    }
    
    saveBackup() {
        try {
            localStorage.setItem('prosti_letters_backup', JSON.stringify(this.letters));
            localStorage.setItem('prosti_queue_backup', JSON.stringify(this.localQueue));
            localStorage.setItem('prosti_last_sync', new Date().toISOString());
        } catch (error) {
            console.error('❌ Ошибка сохранения резервной копии:', error);
        }
    }
    
    fallbackToLocal() {
        const saved = localStorage.getItem('prosti_letters_backup');
        if (saved) {
            this.letters = JSON.parse(saved).filter(letter => this.isLetterValid(letter));
            console.log(`📁 Используем резервную копию: ${this.letters.length} писем`);
            this.updateUI();
        }
    }
    
    isLetterValid(letter) {
        if (!letter || !letter.expiresAt) return false;
        
        const expiresAt = new Date(letter.expiresAt);
        const now = new Date();
        
        // Письмо действительно если не истекло
        return expiresAt > now;
    }
    
    updateUI() {
        // Обновляем статистику
        const today = new Date().toDateString();
        const todayLetters = this.letters.filter(letter => {
            const created = new Date(letter.createdAt);
            return created.toDateString() === today;
        });
        
        // Обновляем счетчики на странице
        if (document.getElementById('todayCount')) {
            document.getElementById('todayCount').textContent = todayLetters.length;
        }
        if (document.getElementById('totalCount')) {
            document.getElementById('totalCount').textContent = this.letters.length;
        }
        if (document.getElementById('onlineCount')) {
            document.getElementById('onlineCount').textContent = this.isOnline ? '✓' : '✗';
        }
        
        // Вызываем глобальную функцию для отрисовки писем
        if (window.updateLettersUI) {
            window.updateLettersUI(this.letters);
        }
    }
    
    // Геттеры
    getAllLetters() {
        return this.letters.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }
    
    getLetterById(id) {
        return this.letters.find(letter => letter.id === id);
    }
    
    // Утилиты
    formatTimeRemaining(expiresAt) {
        const now = new Date();
        const expires = new Date(expiresAt);
        const diffHours = Math.max(0, (expires - now) / (1000 * 60 * 60));
        
        if (diffHours > 48) {
            const days = Math.floor(diffHours / 24);
            return `${days} ${this.pluralize(days, 'день', 'дня', 'дней')}`;
        } else if (diffHours > 24) {
            return '1 день';
        } else {
            const hours = Math.floor(diffHours);
            return `${hours} ${this.pluralize(hours, 'час', 'часа', 'часов')}`;
        }
    }
    
    pluralize(number, one, two, five) {
        let n = Math.abs(number);
        n %= 100;
        if (n >= 5 && n <= 20) return five;
        n %= 10;
        if (n === 1) return one;
        if (n >= 2 && n <= 4) return two;
        return five;
    }
}

// Создаем глобальный экземпляр базы данных
window.db = new GoogleSheetsDB();

// Глобальные функции для взаимодействия с интерфейсом
window.updateLettersUI = function(letters) {
    // Эта функция будет вызвана из script.js
    if (window.renderLettersFromDB) {
        window.renderLettersFromDB(letters);
    }
};

window.getDatabase = function() {
    return window.db;
};

// Уведомления
window.showNotification = function(message, type = 'info') {
    const notification = document.getElementById('notification');
    if (!notification) return;
    
    const colors = {
        info: '#ff6b00',
        success: '#4CAF50',
        warning: '#ff9800',
        error: '#f44336'
    };
    
    notification.textContent = message;
    notification.style.background = `linear-gradient(to bottom, ${colors[type]}, ${colors[type]}99)`;
    notification.style.display = 'block';
    
    setTimeout(() => {
        notification.style.display = 'none';
    }, 3000);
};

// Проигрывание звуков
window.playSound = function(soundId) {
    const audio = document.getElementById(soundId);
    if (audio) {
        audio.currentTime = 0;
        audio.play().catch(e => console.log('Звук заблокирован браузером'));
    }
};