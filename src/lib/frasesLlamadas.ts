// Ideas de frases para las llamadas de Mi día: salen en tarjetas que van
// cambiando solas. Cámbialas por las tuyas cuando quieras (sin fechas ni
// precios, para que no caduquen).

export interface FraseLlamada {
  momento: string;
  texto: string;
}

export const FRASES_LLAMADAS: FraseLlamada[] = [
  { momento: "Presentación", texto: "Buenos días, soy [tu nombre], de Thermomix. ¿Tienes un momentito para atenderme? Es para hacerte una pequeña encuesta de satisfacción, son dos minutos." },
  { momento: "Si no puede ahora", texto: "¿Cuándo te va mejor, por la mañana o por la tarde?" },
  { momento: "Cómo la usa", texto: "¿Qué modelo tienes? ¿Hace mucho que la tienes?" },
  { momento: "Cómo la usa", texto: "¿Quién cocina en casa? ¿Cuántos sois más o menos?" },
  { momento: "Cómo la usa", texto: "¿Qué es lo que más te haces con ella?" },
  { momento: "Cómo la usa", texto: "¿Hay algo que no hayas probado o que no sepas bien cómo se hace?" },
  { momento: "Cookidoo", texto: "¿Lo utilizas para algo más que buscar recetas? Por ejemplo, para la lista de la compra o para planificar la semana." },
  { momento: "Clases", texto: "¿Vienes a clases? … ¿Pero te informan regularmente de las clases?" },
  { momento: "Clases", texto: "¿Te gustaría que te invite yo a las clases?" },
  { momento: "Clases", texto: "¿Qué te iría mejor: mañana, tarde u online?" },
  { momento: "Si la tiene estropeada", texto: "Vaya, ¿qué le pasa? Te paso el número del servicio técnico, que te lo miran." },
  { momento: "Mi cliente", texto: "¡Hola! Soy [tu nombre]. ¿Qué tal estás? ¿Qué tal con tu Thermomix?" },
  { momento: "Mi cliente", texto: "Si te va mejor, paso yo a verte, revisamos tu Thermomix y cocinamos juntas algo que te apetezca." },
  { momento: "Si duda", texto: "¿Qué es lo que te hace dudar? Dímelo con confianza." },
  { momento: "Si no tiene tiempo", texto: "Lo entiendo perfectamente. ¿Te mando un WhatsApp con la información y lo miras con calma?" },
  { momento: "Si le queda lejos", texto: "Sin problema: hacemos clases online, o voy yo a tu casa." },
  { momento: "Cierre", texto: "¿Te puedo mandar por WhatsApp las clases que vayamos haciendo?" },
  { momento: "Despedida", texto: "Muchas gracias por tu tiempo, ha sido un placer. ¡Que la disfrutes!" },
];
