/**
 * mock App 页面对象统一出口。
 *
 * BasePage 也一并导出：新增页面时需要继承它，
 * 而新页面文件应当只从本目录取依赖，不去猜内部文件名。
 */
export { BasePage } from './BasePage';
export { LoginPage } from './LoginPage';
export { HomePage, type MainTabKey } from './HomePage';
export { ProfilePage } from './ProfilePage';
