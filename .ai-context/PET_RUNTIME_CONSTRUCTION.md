# Pet Runtime Construction Audit

This file records where core runtime components are actually constructed.

- Deepseek-pet\frontend\src\main.js:1221 | new PetRenderer(
- Deepseek-pet\frontend\src\main.js:1231 | new PetAnimator({
- Deepseek-pet\frontend\src\main.js:1240 | new PetStateMachine({
- Deepseek-pet\frontend\src\main.js:1227 | new PetAudioManager()
- Deepseek-pet\frontend\src\main.js:1357 | new PetInteractionController({
- Deepseek-pet\frontend\src\main.js:1348 | new PetHitTest({
- Deepseek-pet\frontend\src\main.js:1217 | new AnimationCache()
- Deepseek-pet\frontend\src\main.js:1211 | new AnimationLibrary(
- Deepseek-pet\frontend\src\main.js:1201 | new PetDataLoader()
- Deepseek-pet\frontend\src\main.js:1412 | new ChatController({
