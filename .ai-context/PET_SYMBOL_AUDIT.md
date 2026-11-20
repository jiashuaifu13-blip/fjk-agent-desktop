# Deepseek-pet Symbol Audit

Generated from actual source files.


## Deepseek-pet\frontend\src\main.js

- const CHAT_POSITION_KEY =
- const app =
- const statusElement =
- const stateNameElement =
- const previousStateElement =
- const actionNameElement =
- const transitionReasonElement =
- const interactionStateElement =
- const fpsElement =
- const frameCountElement =
- const cacheCountElement =
- const audioStateElement =
- const clockStateElement =
- const debugToggle =
- const debugPanel =
- const chatScene =
- const chatShell =
- const chatDragHandle =
- const chatContent =
- const chatCollapsed =
- const collapsedText =
- const chatStatusElement =
- const messageList =
- const chatForm =
- const chatInput =
- const sendButton =
- const stopButton =
- const clearButton =
- const toggleChatButton =
- const petRoot =
- const petBubble =
- const canvas =
- function setupDebug() {
- function renderMessages(
- const empty =
- const item =
- const role =
- const content =
- function setupFloatingChat() {
- let collapsed =
- let dragging =
- let pointerId =
- let startPointerX =
- let startPointerY =
- let startLeft =
- let startTop =
- function clampPosition(
- const rect =
- const padding =
- const maxLeft =
- const maxTop =
- function applyPosition(
- const position =
- function savePosition() {
- const rect =
- function restorePosition() {
- const raw =
- const saved =
- const rect =
- const defaultLeft =
- const defaultTop =
- function normalizePosition() {
- const rect =
- function setCollapsed(
- function startDrag(
- const rect =
- function moveDrag(
- const deltaX =
- const deltaY =
- function endDrag(
- let collapsedMoved =
- let collapsedStartX =
- let collapsedStartY =
- const distance =
- async function main() {
- const loader =
- const library =
- const cache =
- const renderer =
- const audioManager =
- const animator =
- const stateMachine =
- const hitTest =
- const interactionController =
- const floatingChat =
- const mockChatClient =
- const chatController =
- const text =
- const content =


## Deepseek-pet\frontend\src\pet\PetRenderer.js

- export class PetRenderer {
- const column =
- const row =
- const sourceX =
- const sourceY =


## Deepseek-pet\frontend\src\pet\PetAnimator.js

- export class PetAnimator {
- const token =
- const action =
- const image =
- const prepared =
- const elapsedSeconds =
- let frame =
- const action =


## Deepseek-pet\frontend\src\pet\PetStateMachine.js

- export class PetStateMachine {
- const stateConfig =
- const returnState =
- const token =
- const previousState =
- const stateConfig =


## Deepseek-pet\frontend\src\pet\PetAudioManager.js

- export class PetAudioManager {
- const audioPath =
- const url =
- const response =
- const blob =
- const handleReady = () => {
- const handleError = () => {
- const cleanup = () => {
- const duration =


## Deepseek-pet\frontend\src\pet\PetInteractionController.js

- export class PetInteractionController {
- const hit =
- const rect =
- const deltaX =
- const deltaY =
- const distance =
- const proposedLeft =
- const proposedTop =
- const position =
- const wasDragging =
- const wasDragging =
- const rect =
- const maxLeft =
- const maxTop =
- const rect =
- const position =


## Deepseek-pet\frontend\src\pet\PetHitTest.js

- export class PetHitTest {
- const rect =
- const x =
- const y =
- const point =
- const pixel =
- const alpha =


## Deepseek-pet\frontend\src\pet\AnimationCache.js

- export class AnimationCache {
- const promise =
- const image = new Image()


## Deepseek-pet\frontend\src\pet\AnimationLibrary.js

- export class AnimationLibrary {
- const animations =


## Deepseek-pet\frontend\src\pet\PetDataLoader.js

- export class PetDataLoader {
- const url = `${this.basePath}/${fileName}`
- const response = await fetch(url)


## Deepseek-pet\frontend\src\chat\ChatController.js

- export class ChatController {
- const message =
- const assistantMessage = {
- let speakingStarted =

