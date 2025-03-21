require('dotenv').config({ path: '.env.local' });
const express = require('express');
const { OpenAI } = require('openai');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const fs = require('fs').promises;
const path = require('path');

const app = express();
app.use(express.json());

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

// Configurar WhatsApp client
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        args: ['--no-sandbox']
    }
});

// Manejar generación de QR
client.on('qr', async (qr) => {
    try {
        // Usar path.join para crear rutas compatibles con Windows
        const qrPath = path.join(__dirname, '..', 'qr-code.png');
        
        // Generar el QR y guardarlo
        await qrcode.toFile(qrPath, qr, {
            color: {
                dark: '#000',
                light: '#FFF'
            },
            width: 1000,
            margin: 1
        });

        // Guardar para la ruta web
        lastQR = await qrcode.toDataURL(qr);
        
        console.log('='.repeat(50));
        console.log(`QR guardado en: ${qrPath}`);
        console.log('QR disponible en: http://localhost:3000/qr');
        console.log('='.repeat(50));
    } catch (error) {
        console.error('Error al generar QR:', error);
    }
});

// Agregar este evento para saber si hay problemas de autenticación
client.on('auth_failure', (msg) => {
    console.error('Error de autenticación:', msg);
});

client.on('ready', () => {
    console.log('Cliente de WhatsApp está listo!');
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

// Manejar mensajes entrantes de WhatsApp
client.on('message', async (message) => {
    try {
        if (!message.isGroupMsg) {
            // Resetear el timeout si hay actividad en el chat
            if (clientesConPersona.has(message.from)) {
                configurarTimeout(message.from);
                return; // No responder si está siendo atendido por una persona
            }

            const mensajeLower = message.body.toLowerCase();

            // Mensaje de bienvenida/menú para el primer mensaje
            if (mensajeLower === 'hola' || mensajeLower === 'menu' || mensajeLower === 'inicio') {
                await randomDelay();
                await message.reply(
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
                await randomDelay();
                await message.reply(
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
                await randomDelay();
                await message.reply("Claro, si necesitas algo adicional con gusto estaré aquí para ayudarte. Sigamos conectados con Conect@T A&D");
                return;
            }

            // Verificar si el mensaje es sobre cobertura
            if (mensajeLower.includes('2') || 
                mensajeLower.includes('lugares') || 
                mensajeLower.includes('cobertura') || 
                mensajeLower.includes('que lugares cubren')) {
                await randomDelay();
                await message.reply(
                    "Gracias por tu interés, contamos con cobertura en:\n\n" +
                    "📍 Area de San José Poaquil Chimaltenango\n" +
                    "📍 San Juan Comalapa\n" +
                    "📍 Tecpan Guatemala\n\n" +
                    "¿Deseas saber áreas específicas de cada municipio? Responde con un SI o NO"
                );
                return;
            }

            // Verificar si el mensaje es sobre planes
            if (mensajeLower.includes('1') || 
                mensajeLower.includes('planes') || 
                mensajeLower.includes('precios') || 
                mensajeLower.includes('disponibles') ||
                mensajeLower.includes('plan disponible')) {
                await randomDelay();
                await message.reply(
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

            // Verificar si quiere hablar con una persona
            if (mensajeLower.includes('4') ||
                mensajeLower.includes('hablar con una persona') || 
                mensajeLower.includes('hablar con persona') || 
                mensajeLower.includes('persona')) {
                await randomDelay();
                clientesConPersona.add(message.from);
                configurarTimeout(message.from); // Iniciar el timeout
                await message.reply("Ha sido un gusto atenderte, en breve te atenderá una persona. Sigamos siempre conectados con Conect@T A&D");
                return;
            }

            // Verificar si es un mensaje de despedida
            if (mensajeLower.includes('gracias') || 
                mensajeLower.includes('adiós') || 
                mensajeLower.includes('hasta luego') ||
                mensajeLower.includes('bye') ||
                mensajeLower.includes('buen día') ||
                mensajeLower.includes('buenas noches') ||
                (mensajeLower.includes('ok') && mensajeLower.length < 5)) {
                await randomDelay();
                await message.reply("¡Ha sido un placer ayudarte! Si necesitas algo más, no dudes en escribirme. ¡Que tengas un excelente día! 😊\n\nSigamos siempre conectados con Conect@T A&D 💫");
                return;
            }

            // Si no es ninguna de las opciones anteriores, usar OpenAI
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
                temperature: 0.8, // Aumentamos ligeramente la temperatura para más creatividad
            });

            await randomDelay();
            await message.reply(response.choices[0].message.content);
        }
    } catch (error) {
        console.error('Error:', error);
        message.reply('Lo siento, hubo un error al procesar tu mensaje.');
    }
});

// Agregar un comando para que los agentes puedan devolver el control al bot
client.on('message', async (message) => {
    if (message.body.toLowerCase() === '!activarbot' && clientesConPersona.has(message.from)) {
        clientesConPersona.delete(message.from);
        await message.reply("¡Hola! Soy Conectín nuevamente a tu servicio 😊 ¿En qué puedo ayudarte?\n\n" +
            "1️⃣ Planes y precios disponibles\n" +
            "2️⃣ Lugares con cobertura\n" +
            "3️⃣ Adquirir un servicio\n" +
            "4️⃣ Hablar con una persona");
    }
});

// Iniciar el cliente de WhatsApp
client.initialize();

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
});


// comando para iniciar el servidor: node server/server.js