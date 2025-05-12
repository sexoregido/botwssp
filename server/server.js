require('dotenv').config({ path: '.env.local' });
console.log('📁 Directorio actual:', process.cwd());
console.log('🔑 Variables de entorno disponibles:', {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY ? '✅ Configurada' : '❌ No configurada',
    NODE_ENV: process.env.NODE_ENV
});

const express = require('express');
const { OpenAI } = require('openai');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs').promises;
const path = require('path');

const app = express();
app.use(express.json());

// Función para crear directorios necesarios
async function crearDirectoriosNecesarios() {
    const directorioAuth = path.join(process.cwd(), 'whatsapp-auth');
    try {
        await fs.mkdir(directorioAuth, { recursive: true });
        // En sistemas Unix/Linux, establecer permisos 777 para pruebas
        // En producción, deberías usar permisos más restrictivos
        if (process.platform !== 'win32') {
            await fs.chmod(directorioAuth, 0o777);
        }
        console.log('✅ Directorios de autenticación creados correctamente');
    } catch (error) {
        console.error('Error al crear directorios:', error);
    }
}

// Variable para almacenar el último QR
let lastQR = null;

// Ruta para ver el QR en el navegador
app.get('/qr', async (req, res) => {
    if (lastQR) {
        res.send(`
            <html>
                <body style="display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0;">
                    <img src="${lastQR}" alt="QR Code" style="max-width: 80%;">
                </body>
            </html>
        `);
    } else {
        res.send('QR no disponible aún. Por favor espere...');
    }
});

// Configurar OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Verificar OpenAI
console.log('OpenAI API Key configurada:', process.env.OPENAI_API_KEY ? '✅ Sí' : '❌ No');

// Configurar WhatsApp client con opciones específicas para Docker
const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: '/usr/src/app/whatsapp-auth',
        clientId: 'whatsapp-bot'
    }),
    puppeteer: {
        executablePath: '/usr/bin/chromium',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu',
            '--disable-extensions',
            '--disable-software-rasterizer',
            '--disable-translate',
            '--disable-logging',
            '--no-default-browser-check',
            '--ignore-certificate-errors',
            '--ignore-certificate-errors-spki-list',
            '--ignore-ssl-errors',
            '--use-gl=swiftshader',
            '--window-size=1280,720',
            '--remote-debugging-port=9222',
            '--user-agent=Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        ],
        headless: 'new',
        timeout: 120000,
        protocolTimeout: 120000,
        defaultViewport: {
            width: 1280,
            height: 720
        },
        handleSIGINT: false,
        handleSIGTERM: false,
        handleSIGHUP: false
    },
    webVersionCache: {
        type: 'local',
        path: '/usr/src/app/.wwebjs_cache'
    },
    authTimeoutMs: 120000,
    qrMaxRetries: 5,
    restartOnAuthFail: true
});

// Agregar más logs
console.log('Iniciando WhatsApp bot con configuración:', {
    authPath: '/usr/src/app/whatsapp-auth',
    executablePath: '/usr/bin/chromium',
    cachePath: '/usr/src/app/.wwebjs_cache'
});

// Modificar el evento QR para más información
client.on('qr', (qr) => {
    console.clear(); // Limpiar la consola para mejor visibilidad
    console.log('\n\n=== ESCANEA ESTE CÓDIGO QR EN WHATSAPP ===\n');
    qrcode.generate(qr, { small: true });
    console.log('\n=========================================\n');
    
    // Actualizar el último QR para el endpoint web
    lastQR = qr;
});

// Agregar más eventos para debug
client.on('loading_screen', (percent, message) => {
    console.log('🔄 LOADING:', percent, message);
});

client.on('authenticated', () => {
    console.log('🔐 AUTHENTICATED - Bot listo para recibir mensajes');
    console.log('✅ Sesión de WhatsApp iniciada correctamente');
});

client.on('auth_failure', msg => {
    console.error('❌ AUTHENTICATION FAILURE:', msg);
});

client.on('ready', () => {
    console.log('✅ Cliente de WhatsApp está listo y escuchando mensajes!');
});

client.on('disconnected', (reason) => {
    console.log('❌ Cliente desconectado:', reason);
});

client.on('change_state', state => {
    console.log('🔄 Estado del cliente cambiado a:', state);
});

client.on('change_battery', batteryInfo => {
    console.log('🔋 Estado de batería:', batteryInfo);
});

// Evento para mensajes entrantes (raw)
client.on('message_create', (msg) => {
    console.log('📝 Mensaje creado (raw):', {
        de: msg.from,
        para: msg.to,
        tipo: msg.type,
        contenido: msg.body,
        timestamp: new Date().toISOString()
    });
});

// Evento para errores generales del cliente
client.on('error', error => {
    console.error('❌ Error en el cliente:', error);
});

// Agregar esta función después de las configuraciones iniciales
const randomDelay = () => {
    const min = 2000; // 2 segundos
    const max = 3000; // 3 segundos
    return new Promise(resolve => setTimeout(resolve, Math.random() * (max - min) + min));
};

// Agregar después de las configuraciones iniciales
const clientesConPersona = new Set(); // Almacena los números que están siendo atendidos por personas
const timeouts = new Map(); // Almacena los timeouts de cada cliente
const mensajesBot = new Set(); // Para rastrear los mensajes enviados por el bot
const conversacionesActivas = new Map(); // Almacena los participantes de cada chat

// Función para manejar el timeout
const configurarTimeout = (numeroCliente) => {
    // Limpiar timeout existente si hay uno
    if (timeouts.has(numeroCliente)) {
        clearTimeout(timeouts.get(numeroCliente));
    }

    // Configurar nuevo timeout (10 minutos = 600000 ms)
    const timeout = setTimeout(async () => {
        if (clientesConPersona.has(numeroCliente)) {
            clientesConPersona.delete(numeroCliente);
            timeouts.delete(numeroCliente);
            
            // Enviar mensaje de reactivación
            try {
                await client.sendMessage(numeroCliente, 
                    "¡Hola! Veo que ha pasado un tiempo sin actividad. Soy Conectín nuevamente a tu servicio 😊\n\n" +
                    "¿En qué puedo ayudarte?\n\n" +
                    "1️⃣ Planes y precios disponibles\n" +
                    "2️⃣ Lugares con cobertura\n" +
                    "3️⃣ Adquirir un servicio\n" +
                    "4️⃣ Hablar con una persona"
                );
            } catch (error) {
                console.error('Error al enviar mensaje de reactivación:', error);
            }
        }
    }, 600000); // 10 minutos

    timeouts.set(numeroCliente, timeout);
};

// Función para verificar si un mensaje es de un tercero
const esMensajeDeTercero = async (message) => {
    try {
        const chatId = message.from;
        
        // Si no tenemos registro de esta conversación, la inicializamos
        if (!conversacionesActivas.has(chatId)) {
            conversacionesActivas.set(chatId, new Set());
        }

        const participantes = conversacionesActivas.get(chatId);
        const remitente = message.author || message.from;
        
        // Si el mensaje no es del cliente original y hay participantes previos
        if (!participantes.has(remitente) && participantes.size > 0) {
            console.log(`Nuevo participante detectado en el chat ${chatId}: ${remitente}`);
            clientesConPersona.add(chatId);
            await client.sendMessage(chatId, 
                "Ha sido un gusto atenderte, ahora serás atendido por una persona. Sigamos siempre conectados con Conect@T A&D");
            return true;
        }

        // Agregar el participante al set
        participantes.add(remitente);
        return false;
    } catch (error) {
        console.error('Error al verificar mensaje de tercero:', error);
        return false;
    }
};

// Mapa para rastrear el contexto de las conversaciones
const contextosConversacion = new Map();

// Función para obtener una respuesta contextual para problemas técnicos
async function obtenerRespuestaProblemasTecnicos(message, mensajeTexto) {
    const chatId = message.from;
    const contexto = contextosConversacion.get(chatId) || { contador: 0, ultimoProblema: '' };
    
    // Detectar tipo de problema
    const esProblemaVelocidad = mensajeTexto.toLowerCase().includes('mb') || 
                               mensajeTexto.toLowerCase().includes('mega') ||
                               mensajeTexto.toLowerCase().includes('velocidad') ||
                               /\d+\s*mb/.test(mensajeTexto.toLowerCase());
    
    const esProblemaTv = mensajeTexto.toLowerCase().includes('television') || 
                        mensajeTexto.toLowerCase().includes('tv') ||
                        mensajeTexto.toLowerCase().includes('canal') ||
                        (mensajeTexto.toLowerCase().includes('señal') && !mensajeTexto.toLowerCase().includes('internet'));

    // Detectar frustración
    const hayFrustracion = mensajeTexto.toLowerCase().includes('siempre') ||
                          mensajeTexto.toLowerCase().includes('lo mismo') ||
                          mensajeTexto.toLowerCase().includes('necesito ayuda') ||
                          contexto.contador >= 2;

    let respuesta = '';

    if (hayFrustracion || contexto.contador >= 2) {
        respuesta = "Entiendo tu frustración y veo que necesitas ayuda más específica. " +
                   "Te sugiero usar la opción 4️⃣ para hablar directamente con nuestro equipo técnico que podrá ayudarte mejor con este problema.";
        clientesConPersona.add(chatId);
    } else if (esProblemaVelocidad) {
        respuesta = "Entiendo que estás teniendo problemas con la velocidad de tu internet. " +
                   "Este tipo de situación requiere una revisión técnica para verificar tu conexión y asegurar que recibas la velocidad contratada. " +
                   "Te sugiero usar la opción 4️⃣ para que nuestro equipo técnico pueda realizar las pruebas necesarias y solucionar tu problema.";
        clientesConPersona.add(chatId);
    } else if (esProblemaTv && contexto.ultimoProblema !== 'tv') {
        respuesta = "Entiendo que tienes problemas con la señal de televisión. " +
                   "¿Podrías decirme si todos los televisores están afectados o solo uno en particular? " +
                   "También sería útil saber si la pantalla está completamente negra o si aparece algún mensaje de error.";
        contexto.ultimoProblema = 'tv';
    } else if (contexto.contador === 0) {
        respuesta = "¡Hola! Lamento que estés teniendo problemas con el servicio 😔. " +
                   "¿Podrías especificar qué tipo de problema estás experimentando? " +
                   "¿Es con el internet, la televisión o ambos?";
    } else {
        respuesta = "Entiendo. Para poder ayudarte mejor con este problema específico, " +
                   "te sugiero usar la opción 4️⃣ para hablar directamente con nuestro equipo técnico.";
        clientesConPersona.add(chatId);
    }

    contexto.contador++;
    contextosConversacion.set(chatId, contexto);
    return respuesta;
}

// Función para detectar si se necesita intervención humana
async function necesitaIntervencionHumana(mensajeTexto) {
    const respuesta = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
            {
                role: 'system',
                content: `Analiza si el mensaje del usuario indica frustración, confusión, o si la consulta es demasiado compleja para un bot.
Responde únicamente con "true" si se necesita intervención humana o "false" si el bot puede manejar la situación.
Considera como señales de necesidad de intervención humana:
- Frustración o enojo en el mensaje
- Preguntas muy específicas sobre problemas técnicos
- Solicitudes que requieren acceso a sistemas o información personal
- Mensajes que indican que el bot no está entendiendo la consulta
- Múltiples preguntas en un solo mensaje que son difíciles de manejar`
            },
            {
                role: 'user',
                content: mensajeTexto
            }
        ],
        temperature: 0.1
    });

    return respuesta.choices[0].message.content.trim().toLowerCase() === 'true';
}

// Función para clasificar la intención del mensaje
async function clasificarIntencion(mensajeTexto) {
    const respuesta = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
            {
                role: 'system',
                content: `Tu tarea es analizar el contenido de un mensaje y clasificarlo únicamente en una de las siguientes categorías:
1. pago_recibido
2. reporte_servicio
3. duda_general
4. nuevo_cliente
5. conversacion_no_clasificada
6. problema_tecnico

Responde únicamente con la categoría en minúsculas y sin ningún otro texto.
Usa 'problema_tecnico' cuando el usuario menciona problemas con internet, señal, conexión o servicio.`
            },
            {
                role: 'user',
                content: mensajeTexto
            }
        ]
    });

    return respuesta.choices[0].message.content.trim();
}

// Función para enviar mensaje con delay
async function enviarMensajeConDelay(chatId, mensaje) {
    try {
        console.log('🚀 Intentando enviar mensaje a:', chatId);
        await randomDelay();
        const response = await client.sendMessage(chatId, mensaje);
        mensajesBot.add(response.id._serialized);
        console.log('✅ Mensaje enviado exitosamente');
        return response;
    } catch (error) {
        console.error('❌ Error al enviar mensaje:', error);
        throw error;
    }
}

// Mapa para controlar el tiempo entre mensajes
const ultimoMensaje = new Map();

// Función para evitar mensajes duplicados
function puedeEnviarMensaje(chatId) {
    const ahora = Date.now();
    const ultimoTiempo = ultimoMensaje.get(chatId) || 0;
    
    // Prevenir mensajes más frecuentes que 2 segundos
    if (ahora - ultimoTiempo < 2000) {
        return false;
    }
    
    ultimoMensaje.set(chatId, ahora);
    return true;
}

// Manejar mensajes entrantes de WhatsApp
client.on('message', async (message) => {
    try {
        // Log completo del mensaje
        console.log('📨 Mensaje completo recibido:', {
            id: message.id,
            from: message.from,
            to: message.to,
            body: message.body,
            type: message.type,
            timestamp: message.timestamp,
            isGroup: message.isGroupMsg,
            hasMedia: message.hasMedia
        });

        // Si es un mensaje de estado o broadcast, ignorarlo
        if (message.from === 'status@broadcast') {
            console.log('📢 Ignorando mensaje de broadcast');
            return;
        }

        if (!message.isGroupMsg) {
            // Prevenir mensajes duplicados
            if (!puedeEnviarMensaje(message.from)) {
                console.log('⚠️ Mensaje duplicado, ignorando...');
                return;
            }

            // Si el mensaje es del operador humano (desde el mismo número)
            if (message.fromMe) {
                clientesConPersona.add(message.to);
                await enviarMensajeConDelay(message.to, 
                    "Ha sido un gusto atenderte, ahora serás atendido por una persona. Sigamos siempre conectados con Conect@T A&D");
                return;
            }

            // Verificar si es un mensaje de un tercero (operador desde WhatsApp)
            if (await esMensajeDeTercero(message)) {
                console.log('Mensaje detectado de operador desde WhatsApp. Desactivando bot para este chat.');
                return;
            }

            // Verificar si el chat está siendo atendido por una persona
            if (clientesConPersona.has(message.from)) {
                return; // No responder si está siendo atendido por una persona
            }

            // Verificar si se necesita intervención humana
            if (await necesitaIntervencionHumana(message.body)) {
                await enviarMensajeConDelay(message.from, 
                    "Entiendo que tu consulta puede requerir una atención más personalizada. " +
                    "Te sugiero usar la opción 4️⃣ para hablar directamente con una persona que podrá ayudarte mejor.\n\n" +
                    "Solo escribe '4' y te conectaré con un asesor 😊");
                return;
            }

            // Verificar si el mensaje contiene medios
            if (message.hasMedia) {
                const media = await message.downloadMedia();
                if (media && media.mimetype.includes("image")) {
                    await enviarMensajeConDelay(message.from, 
                        "¡Gracias por enviar la imagen! Si es un comprobante, será revisado a la brevedad. De no ser así, cuéntame en qué puedo ayudarte 😊");
                    return;
                }
            }

            const mensajeLower = message.body.toLowerCase();

            // Mensaje de bienvenida/menú para el primer mensaje
            if (mensajeLower === 'hola' || mensajeLower === 'menu' || mensajeLower === 'inicio') {
                await enviarMensajeConDelay(message.from,
                    "¡Hola! soy Conectín y estoy aquí para poder ayudarte 😊 elige una de las opciones:\n\n" +
                    "1️⃣ Planes y precios disponibles\n" +
                    "2️⃣ Lugares con cobertura\n" +
                    "3️⃣ Adquirir un servicio\n" +
                    "4️⃣ Hablar con una persona"
                );
                return;
            }

            // Verificar respuesta sobre áreas específicas
            if (mensajeLower.startsWith('s') && mensajeLower.replace('í','i').match(/^si+$/)) {
                await enviarMensajeConDelay(message.from,
                    "Claro, acá te dejo el detalle:\n\n" +
                    "📍 San José Poaquil:\n" +
                    "- Saquitacaj\n" +
                    "- Xequechelaj\n" +
                    "- Chuacruz Palamá\n" +
                    "- Palamá\n" +
                    "- Xepalamá\n" +
                    "- Paley\n" +
                    "- Patoquer\n" +
                    "- Caserío Centro\n" +
                    "- Hacienda vieja\n\n" +
                    "📍 San Juan Comalapa:\n" +
                    "- Casco Urbano\n\n" +
                    "📍 Tecpan:\n" +
                    "- Casco urbano"
                );
                return;
            }

            if (mensajeLower === 'no') {
                await enviarMensajeConDelay(message.from, 
                    "Claro, si necesitas algo adicional con gusto estaré aquí para ayudarte. Sigamos conectados con Conect@T A&D");
                return;
            }

            // Verificar opciones numeradas y palabras clave específicas
            if (mensajeLower === '1' || 
                mensajeLower.includes('planes') || 
                mensajeLower.includes('precios') || 
                mensajeLower.includes('disponibles') ||
                mensajeLower.includes('plan disponible')) {
                await enviarMensajeConDelay(message.from,
                    "Con gusto, nuestros planes son los siguientes:\n\n" +
                    "💫 Q150 - 15Mb de velocidad simétricos (si el televisor es smart TV podría optar a recibir 125 canales digitales)\n\n" +
                    "💫 Q200 - 50Mb de velocidad simétricos (64 canales analógicos o 180 canales digitales)\n\n" +
                    "💫 Q250 - 75Mb de velocidad simétricos (64 canales analógicos o 180 canales digitales)\n\n" +
                    "💫 Q300 - 100Mb de velocidad simétricos (64 canales analógicos o 180 canales digitales)\n\n" +
                    "💫 Q350 - 125Mb de velocidad simétricos (64 canales analógicos o 180 canales digitales)\n\n" +
                    "Si te interesa alguno de nuestros planes no dudes en decírmelo 😊"
                );
                return;
            }

            if (mensajeLower === '2' || 
                mensajeLower.includes('lugares') || 
                mensajeLower.includes('cobertura') || 
                mensajeLower.includes('que lugares cubren')) {
                await enviarMensajeConDelay(message.from,
                    "Gracias por tu interés, contamos con cobertura en:\n\n" +
                    "📍 Area de San José Poaquil Chimaltenango\n" +
                    "📍 San Juan Comalapa\n" +
                    "📍 Tecpan Guatemala\n\n" +
                    "¿Deseas saber áreas específicas de cada municipio? Responde con un SI o NO"
                );
                return;
            }

            if (mensajeLower === '4' ||
                mensajeLower.includes('hablar con una persona') || 
                mensajeLower.includes('hablar con persona') || 
                mensajeLower.includes('persona')) {
                clientesConPersona.add(message.from);
                await enviarMensajeConDelay(message.from, 
                    "Ha sido un gusto atenderte, en breve te atenderá una persona. Sigamos siempre conectados con Conect@T A&D");
                return;
            }

            // Si no es ninguna opción específica, usar el clasificador
            const intencion = await clasificarIntencion(message.body);
            console.log('🤖 Intención clasificada:', intencion);

            // Clasificación inteligente según la intención
            switch (intencion) {
                case 'pago_recibido':
                    await enviarMensajeConDelay(message.from, 
                        "¡Gracias por tu comprobante de pago! En breve será procesado. Si necesitas confirmación, por favor espera unos minutos 😊");
                    return;

                case 'reporte_servicio':
                    clientesConPersona.add(message.from);
                    await enviarMensajeConDelay(message.from, 
                        "Lamentamos que estés teniendo inconvenientes 😥. Ya derivamos tu mensaje a nuestro equipo de soporte técnico, te responderán lo antes posible.");
                    return;

                case 'problema_tecnico':
                    const respuesta = await obtenerRespuestaProblemasTecnicos(message, message.body);
                    await enviarMensajeConDelay(message.from, respuesta);
                    return;

                case 'nuevo_cliente':
                    await enviarMensajeConDelay(message.from, 
                        "¡Gracias por tu interés en Conect@T A&D! Aquí te dejo las opciones para comenzar:\n\n" +
                        "1️⃣ Planes y precios disponibles\n" +
                        "2️⃣ Lugares con cobertura\n" +
                        "3️⃣ Adquirir un servicio\n" +
                        "4️⃣ Hablar con una persona");
                    return;
            }

            // Si llegamos aquí, usar OpenAI para una respuesta personalizada
            const response = await openai.chat.completions.create({
                model: "gpt-3.5-turbo",
                messages: [
                    { 
                        role: "system", 
                        content: `Eres 'Conectín', un asistente virtual carismático y amigable de Conect@T A&D. Tu personalidad es:
- Alegre y empático, usas emojis con moderación
- Informal pero profesional, como un amigo que trabaja en la empresa
- Varías tus saludos y respuestas para sonar más natural
- Adaptas tu tono según el contexto pero mantienes un aire positivo

Tu objetivo principal es ayudar a los clientes de Conect@T A&D con:
- Información sobre planes de internet
- Cobertura del servicio
- Atención al cliente general

IMPORTANTE: Cuando muestres el menú de opciones, SIEMPRE usa exactamente este formato sin modificarlo:
1️⃣ Planes y precios disponibles
2️⃣ Lugares con cobertura
3️⃣ Adquirir un servicio
4️⃣ Hablar con una persona

Para el resto de respuestas, sé creativo y natural, manteniendo la esencia de la información pero expresándola de forma más conversacional y amigable.`
                    },
                    { role: "user", content: message.body }
                ],
                temperature: 0.8,
            });

            await enviarMensajeConDelay(message.from, response.choices[0].message.content);
        }
    } catch (error) {
        console.error('Error:', error);
        await enviarMensajeConDelay(message.from, 'Lo siento, hubo un error al procesar tu mensaje.');
    }
});

// Agregar un comando para que los agentes puedan devolver el control al bot
client.on('message', async (message) => {
    if (message.body.toLowerCase() === '!activarbot' && clientesConPersona.has(message.from)) {
        clientesConPersona.delete(message.from);
        await client.sendMessage(message.from, "¡Hola! Soy Conectín nuevamente a tu servicio 😊 ¿En qué puedo ayudarte?\n\n" +
            "1️⃣ Planes y precios disponibles\n" +
            "2️⃣ Lugares con cobertura\n" +
            "3️⃣ Adquirir un servicio\n" +
            "4️⃣ Hablar con una persona");
    }
});

// Manejadores de proceso para errores no manejados
process.on('uncaughtException', (error) => {
    console.error('❌ Error no manejado:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Promesa rechazada no manejada:', reason);
});

// Iniciar el cliente de WhatsApp
async function iniciarServidor() {
    await crearDirectoriosNecesarios();
    client.initialize();
    
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`Servidor corriendo en puerto ${PORT}`);
    });
}

iniciarServidor().catch(console.error);

// comando para iniciar el servidor: node server/server.js
