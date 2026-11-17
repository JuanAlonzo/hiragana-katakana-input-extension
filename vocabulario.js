// Aqui se guarda el diccionario personalizado

window.diccionarioPersonal = {
  sustantivos: {
    いち: "一", // Uno
    に: "二", // Dos
    さん: "三", // Tres
    よん: "四", // Cuatro
    ご: "五", // Cinco
    ろく: "六", // Seis
    なな: "七", // Siete
    はち: "八", // Ocho
    きゅう: "九", // Nueve
    じゅう: "十", // Diez
    せん: "千", // Mil
    まん: "万", // Diez mil
    ひゃく: "百", // Cien

    はは: "母", // Madre
    ちち: "父", // Padre
    おとうさん: "お父さん", // Padre (formal)
    おかあさん: "お母さん", // Madre (formal)
    ねえさん: "姉さん", // Hermana mayor (formal)

    みせ: "店", // Tienda
    くに: "国", // País
    はな: ["花", "話", "鼻"], // Flor, Conversación, Nariz (Homófonos)
    かみ: ["紙", "神", "髪"], // Papel, Dios, Cabello (Homófonos)
    あめ: ["雨", "飴"], // Lluvia, Caramelo
    はし: ["橋", "箸", "端"], // Puente, Palillos, Borde
    こうこう: ["高校", "方向"], // Bachillerato / Preparatoria, Dirección
    うち: ["家", "内"], // Casa / Hogar, Adentro
    き: ["木", "気"], // Árbol, Espíritu / Energía

    わたし: "私", // Yo
    ぼく: "僕", // Yo (masculino)
    おれ: "俺", // Yo (masculino, informal)
    せんせい: "先生", // Profesor / Maestro
    がくせい: "学生", // Estudiante
    ともだち: "友達", // Amigo

    ねこ: "猫", // Gato
    いぬ: "犬", // Perro
    ほん: "本", // Libro
    ひと: "人", // Persona
    じかん: "時間", // Tiempo / Hora
    かいしゃ: "会社", // Empresa
    でんしゃ: "電車", // Tren eléctrico
    えき: "駅", // Estación
    みち: "道", // Camino / Calle
    いえ: "家", // Casa
    いま: "今", // Ahora
    すき: "好き", // Gustar / Favorito

    にほん: "日本", // Japón
    さくら: "桜", // Cerezo
    くるま: "車", // Coche
    みず: "水", // Agua
    そら: "空", // Cielo
    つき: "月", // Luna
    かぜ: "風", // Viento
    やま: "山", // Montaña
    かわ: "川", // Río
    うみ: "海", // Mar
    ごご: "午後", // Tarde
    ごぜん: "午前", // Mañana
    くち: "口", // Boca
    め: "目", // Ojo
    みみ: "耳", // Oreja
    は: "歯", // Diente (aislado)
    あし: "足", // Pie
    きょう: "今日", // Hoy
    あした: "明日", // Mañana (día siguiente)
    きのう: "昨日", // Ayer
    たんぼ: "田んぼ", // Campo de arroz
    だいがく: "大学", // Universidad
    やまだ: "山田", // Apellido Yamada
    たなか: "田中", // Apellido Tanaka
    やまぐち: "山口", // Apellido Yamaguchi
    なかやま: "中山", // Apellido Nakayama
    とうきょう: "東京", // Tokio
    きょうと: "京都", // Kioto

    ほっかいどう: "北海道", // Hokkaido
    ふじさん: "富士山", // Monte Fuji
  },

  // DICCIONARIO DE RAÍCES VERBALES (Coincidencia Parcial)
  // Raíces protegidas de 2+ moras para evitar colisiones con partículas gramaticales
  raicesVerbos: {
    // Comer (Ichidan)
    たべ: "食べ", // De Taberu (Comer) -> Tabemasu, Tabete, Tabenai...
    たべた: "食べた",
    たべて: "食べて",

    // Beber (Godan)
    のむ: "飲む", // De Nomu (Beber)
    のみ: "飲み", // De Nomimasu, Nomimono
    のんだ: "飲んだ",
    のんで: "飲んで",

    // Ver (Ichidan)
    みる: "見る", // De Miru (Ver)
    みます: "見ます", // Forma cortés
    みた: "見た",
    みて: "見て",

    // Hablar (Godan)
    はなす: "話す", // De Hanasu (Hablar)
    はなし: "話し", // De Hanashimasu
    はなした: "話した",
    はなして: "話して",

    // Ir (Godan)
    いく: "行く", // De Iku (Ir)
    いき: "行き", // De Ikimasu
    いった: "行った",
    いって: "行って",

    // Venir (Kuru / Irregular)
    くる: "来る", // De Kuru (Venir)
    きま: "来ま", // De Kimasu
    きた: "来た",
    きて: "来て",

    // Comprar (Godan)
    かう: "買う", // De Kau (Comprar)
    かい: "買い", // De Kaimasu, Kaimono
    かった: "買った",
    かって: "買って",

    // Leer (Godan)
    よむ: "読む", // De Yomu (Leer)
    よみ: "読み", // De Yomimasu
    よんだ: "読んだ",
    よんで: "読んで",

    // Dormir (Ichidan)
    ねる: "寝る", // De Neru (Dormir)
    ねま: "寝ま", // De Nemasu (protegido contra partícula 'ne')
    ねた: "寝た",
    ねて: "寝て",

    // Morir (Godan)
    しぬ: "死ぬ", // De Shinu (Morir)
    しに: "死に", // De Shinimasu
    しんだ: "死んだ",
    しんで: "死んで",

    // Estudiar (Suru)
    べんきょう: "勉強", // De Benkyou suru (Estudiar) -> Benkyou shimasu

    // Adjetivos -i (Conjugables)
    ちいさ: "小さ", // De Chiisai (Pequeño) -> Chiisakute
    おお: "大", // De Okii (Grande) -> Ookikute
    あお: "青", // De Aoi (Azul) -> Aokute
    あか: "赤", // De Akai (Rojo) -> Akakute
    しろ: "白", // De Shiroi (Blanco) -> Shirokute
    くろ: "黒", // De Kuroi (Negro) -> Kurokute
  },

  // CATEGORÍAS TEMÁTICAS DEL VOCABULARIO BASE
  categorias: {
    // Números
    いち: "Numeros",
    に: "Numeros",
    さん: "Numeros",
    よん: "Numeros",
    ご: "Numeros",
    ろく: "Numeros",
    なな: "Numeros",
    hachi: "Numeros",
    はち: "Numeros",
    きゅう: "Numeros",
    じゅう: "Numeros",
    せん: "Numeros",
    まん: "Numeros",
    ひゃく: "Numeros",

    // Personas y Familia
    はは: "Personas",
    ちち: "Personas",
    おとうさん: "Personas",
    おかあさん: "Personas",
    ねえさん: "Personas",
    わたし: "Personas",
    ぼく: "Personas",
    おれ: "Personas",
    ひと: "Personas",
    せんせい: "Personas",
    がくせい: "Personas",
    ともだち: "Personas",
    やまだ: "Personas",
    たなか: "Personas",
    やまぐち: "Personas",
    なかやま: "Personas",

    // Animales y Naturaleza
    ねこ: "Animales",
    いぬ: "Animales",
    さくら: "Animales",
    みず: "Animales",
    そら: "Animales",
    つき: "Animales",
    かぜ: "Animales",
    やま: "Animales",
    かわ: "Animales",
    うみ: "Animales",
    き: "Animales",
    はな: "Animales",

    // General / Objetos
    かみ: "General",
    あめ: "Comida",
    はし: "General",
    ほん: "General",
    じかん: "General",
    でんしゃ: "General",
    みち: "General",
    いえ: "General",
    うち: "General",
    くち: "General",
    め: "General",
    みみ: "General",
    は: "General",
    あし: "General",

    // Lugares
    くに: "Lugares",
    みせ: "Lugares",
    だいがく: "Lugares",
    にほん: "Lugares",
    とうきょう: "Lugares",
    きょうと: "Lugares",
    ほっかいどう: "Lugares",
    ふじさん: "Lugares",
    たんぼ: "Lugares",
    かいしゃ: "Lugares",
    えき: "Lugares",
    こうこう: "Lugares",

    // Tiempo y Fechas
    ごご: "Tiempo",
    ごぜん: "Tiempo",
    きょう: "Tiempo",
    あした: "Tiempo",
    きのう: "Tiempo",
    いま: "Tiempo",

    // Verbos
    たべ: "Verbos",
    たべた: "Verbos",
    たべて: "Verbos",
    のむ: "Verbos",
    のみ: "Verbos",
    のんだ: "Verbos",
    のんで: "Verbos",
    みる: "Verbos",
    みます: "Verbos",
    みた: "Verbos",
    みて: "Verbos",
    はなす: "Verbos",
    はなし: "Verbos",
    はなした: "Verbos",
    はなして: "Verbos",
    いく: "Verbos",
    いき: "Verbos",
    いった: "Verbos",
    いって: "Verbos",
    くる: "Verbos",
    きま: "Verbos",
    きた: "Verbos",
    きて: "Verbos",
    かう: "Verbos",
    かい: "Verbos",
    かった: "Verbos",
    かって: "Verbos",
    よむ: "Verbos",
    よみ: "Verbos",
    よんだ: "Verbos",
    よんで: "Verbos",
    ねる: "Verbos",
    ねま: "Verbos",
    ねた: "Verbos",
    ねて: "Verbos",
    しぬ: "Verbos",
    しに: "Verbos",
    しんだ: "Verbos",
    しんで: "Verbos",
    べんきょう: "Verbos",

    // Adjetivos
    ちいさ: "Adjetivos",
    おお: "Adjetivos",
    あお: "Adjetivos",
    あか: "Adjetivos",
    しろ: "Adjetivos",
    くろ: "Adjetivos",
    すき: "Adjetivos",
  },
};
