/**
 * Сервис для обработки изображений перед отправкой на сервер.
 * Решает проблему "битых" ссылок blob:, конвертируя файлы в Base64.
 * Также сжимает большие изображения для экономии места в БД.
 */
export const processImage = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error("Нет файла"));
      return;
    }

    // 1. Если это SVG, не сжимаем, чтобы не испортить вектор, просто читаем как есть.
    if (file.type === 'image/svg+xml') {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (e) => reject(e);
      reader.readAsDataURL(file);
      return;
    }

    // 2. Читаем файл
    const reader = new FileReader();
    reader.readAsDataURL(file);
    
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      
      img.onload = () => {
        // 3. Если картинка маленькая (< 500Кб), оставляем оригинал (чтобы сохранить прозрачность PNG и качество)
        if (file.size < 500 * 1024) {
            resolve(img.src);
            return;
        }

        // 4. Если картинка большая, сжимаем её через Canvas
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const MAX_SIZE = 1200; // Максимальный размер по одной стороне

        // Вычисляем новые размеры с сохранением пропорций
        if (width > height) {
          if (width > MAX_SIZE) {
            height *= MAX_SIZE / width;
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width *= MAX_SIZE / height;
            height = MAX_SIZE;
          }
        }

        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
             // Если канвас не доступен, возвращаем оригинал
             resolve(img.src);
             return;
        }
        
        // Рисуем на белом фоне (на случай прозрачного PNG, который конвертируем в JPEG)
        // Но лучше сохранить прозрачность, если это PNG. 
        // Однако JPEG лучше сжимает фото. Выберем стратегию:
        // Фото обычно JPEG. Логотипы PNG.
        // Если исходник JPEG - жмем в JPEG 0.75
        // Если исходник PNG и большой - жмем в PNG (но это может быть тяжело) или JPEG (теряем прозрачность).
        // Компромисс: большие PNG жмем в JPEG для экономии места в БД (так как это чаще всего фото блюд).
        
        // Заливаем белым (для прозрачных PNG, которые станут JPEG)
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        
        ctx.drawImage(img, 0, 0, width, height);
        
        // Конвертируем в JPEG с качеством 0.8
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        resolve(dataUrl);
      };
      
      img.onerror = (e) => reject(e);
    };
    
    reader.onerror = (e) => reject(e);
  });
};