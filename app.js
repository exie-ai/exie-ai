const API_URL="https://script.google.com/macros/s/AKfycbwdQ9iwmT7WqiQI9nT1q5rtU5WP5ylxa-j3ScJHnzS9gj7b9ZoF3oFfFNGrXv_0TfV0/exec"

function add(text,type){

let msg=document.createElement("div")
msg.className=type

let bubble=document.createElement("div")
bubble.className="bubble"
bubble.innerText=text

msg.appendChild(bubble)

document.getElementById("messages").appendChild(msg)

}

function quick(text){

document.getElementById("input").value=text
send()

}

async function send(){

let input=document.getElementById("input")

let text=input.value

if(!text)return

add(text,"user")

input.value=""

document.getElementById("typing").style.display="block"

let res=await fetch(API_URL,{
method:"POST",
body:JSON.stringify({
action:"askAI",
message:text
})
})

let data=await res.json()

document.getElementById("typing").style.display="none"

add(data.reply,"bot")

speak(data.reply)

}

function voice(){

let rec=new(window.SpeechRecognition||window.webkitSpeechRecognition)()

rec.start()

rec.onresult=function(e){

let text=e.results[0][0].transcript

document.getElementById("input").value=text

send()

}

}

function speak(text){

let speech=new SpeechSynthesisUtterance(text)

speech.rate=.95
speech.pitch=1

speechSynthesis.speak(speech)

}