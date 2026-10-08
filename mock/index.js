import Mock from './WxMock';
// 导入包含path和data的对象
import homeMock from './home/index';

export default () => {
  // 在这里添加新的mock数据
  const mockData = [...homeMock];
  mockData.forEach((item) => {
    Mock.mock(item.path, { code: 200, success: true, data: item.data });
  });
};
