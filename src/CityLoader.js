import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export class CityLoader {
  constructor(scene) {
    this.scene = scene;
    this.loader = new GLTFLoader();
  }

  async load(path) {
    const gltf = await this.loader.loadAsync(path);
    const model = gltf.scene;

    model.updateMatrixWorld(true);
    this.scene.add(model);

    return model;
  }
}
