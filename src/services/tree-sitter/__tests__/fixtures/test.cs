using System;
using System.Collections.Generic;
using IO = System.IO;
global using System.Threading.Tasks;

namespace TestNamespace
{
    [TestAttribute]
    public interface ITestInterface
    {
        void InterfaceMethod();
        string InterfaceProperty { get; set; }
    }

    [TestAttribute]
    public class TestClass : ITestInterface
    {
        // 嵌套接口
        public interface INestedInterface 
        {
            void NestedMethod();
        }

        private readonly List<string> _items = new List<string>();
        public event EventHandler TestEvent;
        
        public TestClass(string name)
        {
            Name = name;
        }

        public string Name { get; set; }

        public void InterfaceMethod()
        {
            // 实现接口方法
        }

        public string InterfaceProperty { get; set; }

        // 其他测试代码保持不变...
    }
}