// ============================================
// MAIN SCRIPT FOR "PROSTI" SITE
// ============================================

// Глобальные переменные
let currentLetterId = null;
let letters = [];

// Элементы интерфейса
const elements = {
    lettersContainer: document.getElementById('lettersContainer'),
    letterModal: document.getElementById('letterModal'),
    readModal: document.getElementById('readModal'),
    addBtn: document.getElementById('addBtn'),
    cancelBtn: document.getElementById('cancelBtn'),
    sendBtn: document.getElementById('sendBtn'),
    closeReadBtn: document.getElementById('closeReadBtn'),
    letterText: document.getElementById('letterText'),
    charCount: document.getElementById('charCount'),
    commentInput: document.getElementById('commentInput'),
    addComment: document.getElementById('addComment')
};

// Инициализация
async function init() {
    console.log('🔥 Инициализация сайта "ПРОСТИ"...');
    
    // Инициализируем базу данных (уже сделано в google-sheets.js)
    await waitForDatabase();
    
    // Настраиваем обработчики событий
    setupEventListeners();
    
    // Запускаем анимацию фона
    initFireAnimation();
    
    // Включаем звуки
    initAudio();
    
    console.log('✅ Сайт готов к работе!');
}

// Ожидание инициализации базы данных
async function waitForDatabase() {
    return new Promise((resolve) => {
        const checkDB = () => {
            if (window.db && window.db.getAllLetters) {
                letters = window.db.getAllLetters();
                renderLetters();
                resolve();
            } else {
                setTimeout(checkDB, 100);
            }
        };
        checkDB();
    });
}

// Настройка обработчиков событий
function setupEventListeners() {
    // Кнопка добавления письма
    elements.addBtn.addEventListener('click', () => {
        elements.letterText.value = '';
        elements.charCount.textContent = '500';
        elements.letterModal.style.display = 'flex';
        window.playSound('paperSound');
    });

    // Отмена создания письма
    elements.cancelBtn.addEventListener('click', () => {
        elements.letterModal.style.display = 'none';
    });

    // Отправка письма
    elements.sendBtn.addEventListener('click', async () => {
        const text = elements.letterText.value.trim();
        
        if (text.length < 5) {
            showNotification('Письмо должно содержать хотя бы 5 символов', 'warning');
            return;
        }
        
        if (text.length > 500) {
            showNotification('Максимальная длина письма — 500 символов', 'warning');
            return;
        }
        
        // Показываем загрузку
        elements.sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Отправляем...';
        elements.sendBtn.disabled = true;
        
        try {
            const result = await window.db.saveLetter(text);
            
            // Анимация
            if (result.success) {
                window.playSound('whooshSound');
                showNotification(result.message, 'success');
                
                // Анимация создания письма
                animateLetterCreation(result.letter.id);
                
                // Закрываем модальное окно
                setTimeout(() => {
                    elements.letterModal.style.display = 'none';
                }, 1000);
            }
        } catch (error) {
            showNotification('Ошибка сохранения письма', 'error');
            console.error('Ошибка:', error);
        } finally {
            // Восстанавливаем кнопку
            elements.sendBtn.innerHTML = '<i class="fas fa-fire"></i> Бросить в огонь';
            elements.sendBtn.disabled = false;
        }
    });

    // Счетчик символов
    elements.letterText.addEventListener('input', function() {
        const remaining = 500 - this.value.length;
        elements.charCount.textContent = remaining;
        elements.charCount.style.color = remaining < 50 ? '#ff3300' : '#ff9966';
    });

    // Закрытие модального окна чтения
    elements.closeReadBtn.addEventListener('click', () => {
        elements.readModal.style.display = 'none';
        currentLetterId = null;
    });

    // Закрытие модалок по клику вне окна
    window.addEventListener('click', (e) => {
        if (e.target === elements.letterModal) {
            elements.letterModal.style.display = 'none';
        }
        if (e.target === elements.readModal) {
            elements.readModal.style.display = 'none';
            currentLetterId = null;
        }
    });

    // Добавление комментария
    elements.addComment.addEventListener('click', async () => {
        const commentText = elements.commentInput.value.trim();
        
        if (!commentText || !currentLetterId) return;
        
        if (commentText.length < 2) {
            showNotification('Комментарий слишком короткий', 'warning');
            return;
        }
        
        const result = await window.db.addComment(currentLetterId, commentText);
        
        if (result.success) {
            window.playSound('paperSound');
            elements.commentInput.value = '';
            showNotification('Комментарий добавлен', 'success');
            
            // Обновляем отображение письма
            openLetter(currentLetterId);
        } else {
            showNotification('Ошибка добавления комментария', 'error');
        }
    });

    // Реакции
    document.querySelectorAll('.reaction').forEach(btn => {
        btn.addEventListener('click', async function() {
            if (!currentLetterId) return;
            
            const reactionType = this.dataset.type;
            const result = await window.db.addReaction(currentLetterId, reactionType);
            
            if (result.success) {
                // Анимация реакции
                this.style.transform = 'scale(1.2)';
                setTimeout(() => this.style.transform = '', 300);
                
                // Эффект частиц
                createParticles(this);
                
                // Обновляем счетчики
                openLetter(currentLetterId);
            }
        });
    });
}

// Отрисовка писем (вызывается из базы данных)
window.renderLettersFromDB = function(dbLetters) {
    letters = dbLetters;
    renderLetters();
};

// Рендеринг писем
function renderLetters() {
    if (!elements.lettersContainer) return;
    
    // Очищаем контейнер
    elements.lettersContainer.innerHTML = '';
    
    if (letters.length === 0) {
        // Сообщение если писем нет
        const emptyMessage = document.createElement('div');
        emptyMessage.className = 'empty-message pixel-text';
        emptyMessage.innerHTML = `
            <i class="fas fa-fire"></i>
            <h3>Пока здесь тихо...</h3>
            <p>Будь первым, кто бросит письмо в огонь!</p>
        `;
        elements.lettersContainer.appendChild(emptyMessage);
        return;
    }
    
    // Сортируем по дате создания (новые сверху)
    const sortedLetters = [...letters].sort((a, b) => 
        new Date(b.createdAt) - new Date(a.createdAt)
    );
    
    // Отрисовываем каждое письмо
    sortedLetters.forEach((letter, index) => {
        const letterEl = createLetterElement(letter, index);
        elements.lettersContainer.appendChild(letterEl);
    });
}

// Создание элемента письма
function createLetterElement(letter, index) {
    const letterEl = document.createElement('div');
    
    // Определяем стадию "сгорания"
    const stage = getLetterStage(letter.expiresAt);
    const timeRemaining = window.db.formatTimeRemaining(letter.expiresAt);
    
    // Обрезаем текст для превью
    const previewText = letter.text.length > 80 
        ? letter.text.substring(0, 80) + '...' 
        : letter.text;
    
    // Случайная задержка для анимации
    const delay = index % 10;
    
    letterEl.className = `letter day${stage}`;
    letterEl.style.setProperty('--delay', delay);
    letterEl.dataset.id = letter.id;
    
    letterEl.innerHTML = `
        <div class="letter-content">
            <div class="letter-text">${escapeHtml(previewText)}</div>
            ${letter.local ? '<div class="local-badge" title="Только у тебя"><i class="fas fa-user"></i></div>' : ''}
        </div>
        <div class="letter-time">
            <i class="fas fa-clock"></i> ${timeRemaining}
        </div>
    `;
    
    // Клик для открытия письма
    letterEl.addEventListener('click', () => openLetter(letter.id));
    
    return letterEl;
}

// Определение стадии письма
function getLetterStage(expiresAt) {
    const now = new Date();
    const expires = new Date(expiresAt);
    const diffHours = (expires - now) / (1000 * 60 * 60);
    
    if (diffHours > 48) return 1;  // День 1
    if (diffHours > 24) return 2;  // День 2
    return 3;  // День 3 (последний день)
}

// Открытие письма для чтения
async function openLetter(letterId) {
    const letter = window.db.getLetterById(letterId);
    if (!letter) return;
    
    currentLetterId = letterId;
    
    // Увеличиваем счетчик просмотров
    if (!letter.views) letter.views = 0;
    letter.views++;
    
    // Обновляем письмо в базе
    await window.db.updateLetter(letterId, { views: letter.views });
    
    // Время до сгорания
    const timeRemaining = window.db.formatTimeRemaining(letter.expiresAt);
    
    // Обновляем интерфейс
    document.getElementById('letterTime').querySelector('span').textContent = timeRemaining;
    document.getElementById('letterViews').textContent = letter.views;
    document.getElementById('letterBody').textContent = letter.text;
    
    // Реакции
    document.getElementById('fireCount').textContent = letter.reactions?.fire || 0;
    document.getElementById('heartbreakCount').textContent = letter.reactions?.heartbreak || 0;
    document.getElementById('understandCount').textContent = letter.reactions?.understand || 0;
    document.getElementById('sparkleCount').textContent = letter.reactions?.sparkle || 0;
    
    // Комментарии
    const commentsList = document.getElementById('commentsList');
    commentsList.innerHTML = '';
    
    if (letter.comments && letter.comments.length > 0) {
        letter.comments.forEach(comment => {
            const commentEl = document.createElement('div');
            commentEl.className = 'comment';
            commentEl.textContent = comment.text;
            commentsList.appendChild(commentEl);
        });
    }
    
    // Показываем/скрываем форму комментариев в зависимости от стадии
    const stage = getLetterStage(letter.expiresAt);
    const commentForm = document.getElementById('commentForm');
    
    if (stage === 1) {
        commentForm.style.display = 'block';
    } else {
        commentForm.style.display = 'none';
        if (!letter.comments || letter.comments.length === 0) {
            const noComments = document.createElement('p');
            noComments.className = 'pixel-text';
            noComments.textContent = 'Комментарии можно было оставлять только в первый день';
            commentsList.appendChild(noComments);
        }
    }
    
    // Показываем модальное окно
    elements.readModal.style.display = 'flex';
    window.playSound('paperSound');
}

// Анимация создания письма
function animateLetterCreation(letterId) {
    const letterEl = document.querySelector(`[data-id="${letterId}"]`);
    if (!letterEl) return;
    
    // Эффект появления
    letterEl.style.opacity = '0';
    letterEl.style.transform = 'scale(0) translateY(50px)';
    
    setTimeout(() => {
        letterEl.style.transition = 'all 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)';
        letterEl.style.opacity = '1';
        letterEl.style.transform = 'scale(1) translateY(0)';
    }, 100);
    
    // Эффект вспышки
    const flash = document.createElement('div');
    flash.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        width: 100px;
        height: 100px;
        background: radial-gradient(circle, #ff6600, transparent 70%);
        border-radius: 50%;
        transform: translate(-50%, -50%) scale(0);
        pointer-events: none;
        z-index: 1000;
        animation: flash 0.5s forwards;
    `;
    
    document.body.appendChild(flash);
    setTimeout(() => flash.remove(), 500);
}

// Анимация огня на фоне
function initFireAnimation() {
    const fireBg = document.getElementById('fireBackground');
    if (!fireBg) return;
    
    // Создаем частицы огня
    for (let i = 0; i < 20; i++) {
        const particle = document.createElement('div');
        particle.style.cssText = `
            position: absolute;
            width: ${Math.random() * 100 + 50}px;
            height: ${Math.random() * 100 + 50}px;
            background: radial-gradient(circle, 
                rgba(255, 100, 0, ${Math.random() * 0.2 + 0.1}) 0%,
                rgba(255, 50, 0, ${Math.random() * 0.1 + 0.05}) 30%,
                transparent 70%);
            border-radius: 50%;
            pointer-events: none;
            animation: fire-particle ${Math.random() * 10 + 5}s infinite alternate ease-in-out;
            animation-delay: ${Math.random() * 5}s;
        `;
        
        // Случайная позиция
        particle.style.left = Math.random() * 100 + '%';
        particle.style.top = Math.random() * 100 + '%';
        
        fireBg.appendChild(particle);
    }
    
    // Добавляем стили для анимации
    const style = document.createElement('style');
    style.textContent = `
        @keyframes fire-particle {
            0% { transform: translate(0, 0) scale(1); opacity: 0.5; }
            100% { transform: translate(${Math.random() * 100 - 50}px, ${Math.random() * 100 - 50}px) scale(${Math.random() * 0.5 + 0.8}); opacity: ${Math.random() * 0.5 + 0.3}; }
        }
        
        @keyframes flash {
            0% { transform: translate(-50%, -50%) scale(0); opacity: 1; }
            100% { transform: translate(-50%, -50%) scale(3); opacity: 0; }
        }
    `;
    document.head.appendChild(style);
}

// Инициализация звуков
function initAudio() {
    // Включаем звук костра
    const fireSound = document.getElementById('fireSound');
    if (fireSound) {
        fireSound.volume = 0.1;
        fireSound.loop = true;
        
        // Автовоспроизведение при первом клике
        document.addEventListener('click', function enableAudio() {
            fireSound.play().catch(e => {
                console.log('Автовоспроизведение звука заблокировано браузером');
            });
            document.removeEventListener('click', enableAudio);
        }, { once: true });
    }
}

// Создание частиц для реакций
function createParticles(element) {
    const rect = element.getBoundingClientRect();
    const emoji = element.querySelector('.emoji').textContent;
    
    for (let i = 0; i < 5; i++) {
        const particle = document.createElement('div');
        particle.textContent = emoji;
        particle.style.cssText = `
            position: fixed;
            top: ${rect.top + rect.height / 2}px;
            left: ${rect.left + rect.width / 2}px;
            font-size: 1.5rem;
            pointer-events: none;
            z-index: 2000;
            transform: translate(-50%, -50%);
            animation: particle-float ${0.5 + Math.random() * 0.5}s forwards;
        `;
        
        document.body.appendChild(particle);
        setTimeout(() => particle.remove(), 1000);
    }
}

// Вспомогательные функции
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showNotification(message, type = 'info') {
    if (window.showNotification) {
        window.showNotification(message, type);
    } else {
        alert(message);
    }
}

// Запуск при загрузке страницы
document.addEventListener('DOMContentLoaded', init);

// Обновление интерфейса каждые 5 секунд
setInterval(() => {
    if (window.db) {
        letters = window.db.getAllLetters();
        renderLetters();
    }
}, 5000);